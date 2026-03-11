export function corsHeaders(tenantHeader, extras = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": `content-type,${tenantHeader}`,
    ...extras,
  };
}

export function writeJson(res, status, payload, tenantHeader) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(
    status,
    corsHeaders(tenantHeader, {
      "content-type": "application/json",
    })
  );
  res.end(body);
}

export function writeText(res, status, payload, tenantHeader) {
  res.writeHead(
    status,
    corsHeaders(tenantHeader, {
      "content-type": "text/plain",
    })
  );
  res.end(payload);
}

export function writeBytes(res, status, payload, contentType, tenantHeader) {
  res.writeHead(
    status,
    corsHeaders(tenantHeader, {
      "content-type": contentType,
    })
  );
  res.end(payload);
}

export function writeNoContent(res, tenantHeader) {
  res.writeHead(204, corsHeaders(tenantHeader));
  res.end();
}

export function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeNdjson(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

export function streamMeshAssetChunks(res, asset, tenantHeader, chunkSize = 12000) {
  const resolvedChunkSize = Number.isFinite(chunkSize)
    ? Math.max(256, Math.floor(chunkSize))
    : 12000;
  const sourceText = Buffer.isBuffer(asset.data) ? asset.data.toString("utf8") : String(asset.data);
  const mesh = JSON.parse(sourceText);
  const arrayKeys = [
    "positions",
    "normals",
    "indices",
    "edgePositions",
    "edgeIndices",
    "edgeSelectionIndices",
    "faceIds",
  ];
  const meta = {};
  for (const [key, value] of Object.entries(mesh)) {
    if (arrayKeys.includes(key)) continue;
    meta[key] = value;
  }

  res.writeHead(
    200,
    corsHeaders(tenantHeader, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
    })
  );

  writeNdjson(res, {
    type: "meta",
    payload: meta,
    arrays: Object.fromEntries(
      arrayKeys.map((key) => [key, Array.isArray(mesh[key]) ? mesh[key].length : 0])
    ),
  });

  for (const key of arrayKeys) {
    const values = mesh[key];
    if (!Array.isArray(values) || values.length === 0) continue;
    const totalChunks = Math.ceil(values.length / resolvedChunkSize);
    for (let i = 0; i < values.length; i += resolvedChunkSize) {
      const chunkIndex = Math.floor(i / resolvedChunkSize);
      writeNdjson(res, {
        type: "arrayChunk",
        key,
        chunkIndex,
        totalChunks,
        data: values.slice(i, i + resolvedChunkSize),
      });
    }
  }

  if (Array.isArray(mesh.selections) && mesh.selections.length > 0) {
    const selectionChunkSize = 128;
    const totalChunks = Math.ceil(mesh.selections.length / selectionChunkSize);
    for (let i = 0; i < mesh.selections.length; i += selectionChunkSize) {
      const chunkIndex = Math.floor(i / selectionChunkSize);
      writeNdjson(res, {
        type: "selectionChunk",
        chunkIndex,
        totalChunks,
        data: mesh.selections.slice(i, i + selectionChunkSize),
      });
    }
  }

  writeNdjson(res, { type: "done" });
  res.end();
}
