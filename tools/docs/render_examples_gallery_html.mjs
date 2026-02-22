import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const docsRoot = path.join(repoRoot, "docs");
const examplesRoot = path.join(docsRoot, "public", "examples");

const dslManifestPath = path.join(examplesRoot, "dsl", "manifest.json");
const sketchManifestPath = path.join(examplesRoot, "sketch", "manifest.json");

const docSourcePaths = {
  features: path.join(docsRoot, "reference", "dsl", "examples", "features.md"),
  generators: path.join(docsRoot, "reference", "dsl", "examples", "generators.md"),
  tolerancing: path.join(docsRoot, "reference", "dsl", "examples", "tolerancing.md"),
  sketches: path.join(docsRoot, "reference", "dsl", "examples", "sketches.md"),
};

const dslCodeTargets = {
  extrude: { doc: "features", heading: "Extrude" },
  surface: { doc: "features", heading: "Surface" },
  revolve: { doc: "features", heading: "Revolve" },
  loft: { doc: "features", heading: "Loft" },
  sweep: { doc: "features", heading: "Sweep" },
  pipe: { doc: "features", heading: "Pipe" },
  "sweep-sketch": { doc: "features", heading: "Sweep (Arbitrary Sketch)" },
  hole: { doc: "features", heading: "Hole" },
  "hole-advanced": { doc: "features", heading: "Hole" },
  fillet: { doc: "features", heading: "Fillet" },
  "variable-fillet": { doc: "features", heading: "Variable Fillet" },
  chamfer: { doc: "features", heading: "Chamfer" },
  "variable-chamfer": { doc: "features", heading: "Variable Chamfer" },
  boolean: { doc: "features", heading: "Boolean Union" },
  "boolean-cut": { doc: "features", heading: "Boolean Subtract" },
  "boolean-intersect": { doc: "features", heading: "Boolean Intersect" },
  pattern: { doc: "features", heading: "Pattern (Feature/Body)" },
  "pattern-circular": { doc: "features", heading: "Pattern (Circular)" },
  "feature-array": { doc: "generators", heading: "Feature Array" },
  tolerancing: { doc: "tolerancing", heading: "Tolerancing PMI Sidecar" },
  "spline-array": { doc: "generators", heading: "Spline Array" },
  "circular-array": { doc: "generators", heading: "Circular Array" },
  "radial-array": { doc: "generators", heading: "Radial Array" },
  mirror: { doc: "features", heading: "Mirror" },
  "move-body": { doc: "features", heading: "Move Body" },
  "delete-face": { doc: "features", heading: "Delete Face" },
  "replace-face": { doc: "features", heading: "Replace Face" },
  "move-face": { doc: "features", heading: "Move Face" },
  draft: { doc: "features", heading: "Draft" },
  thicken: { doc: "features", heading: "Thicken" },
  shell: { doc: "features", heading: "Shell" },
  "thread-cosmetic": { doc: "tolerancing", heading: "Cosmetic Thread" },
};

const sketchCodeTargets = {
  line: { doc: "sketches", heading: "Line" },
  arc: { doc: "sketches", heading: "Arc" },
  circle: { doc: "sketches", heading: "Circle" },
  ellipse: { doc: "sketches", heading: "Ellipse" },
  "rect-center": { doc: "sketches", heading: "Rectangle (Center)" },
  "rect-corner": { doc: "sketches", heading: "Rectangle (Corner)" },
  slot: { doc: "sketches", heading: "Slot" },
  polygon: { doc: "sketches", heading: "Polygon" },
  spline: { doc: "sketches", heading: "Spline" },
  point: { doc: "sketches", heading: "Point" },
  "rect-array": { doc: "sketches", heading: "Rectangle Array" },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractCodeBlock(markdown, heading) {
  const headingRegex = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m");
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) {
    return null;
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remaining = markdown.slice(sectionStart);
  const nextHeading = /^##\s+/m.exec(remaining);
  const section = nextHeading
    ? remaining.slice(0, nextHeading.index)
    : remaining;

  const codeMatch = /```(?:ts|typescript|js|json)?\n([\s\S]*?)```/m.exec(section);
  if (!codeMatch) {
    return null;
  }
  return codeMatch[1].trim();
}

function classifyDsl(exampleId) {
  if (exampleId.includes("array") || exampleId === "feature-array") return "Generators";
  if (exampleId === "tolerancing" || exampleId === "thread-cosmetic") return "PMI";
  return "Features";
}

function renderCard(example, codeAnchor, category) {
  const title = escapeHtml(example.title);
  const image = escapeHtml(example.image);
  return `
    <a class="card" href="#${codeAnchor}">
      <img src="${image}" alt="${title}" loading="lazy" />
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-meta">${escapeHtml(category)}</div>
      </div>
    </a>`;
}

function renderCodeSection(entry) {
  return `
    <article class="code-entry" id="${entry.anchor}">
      <h3>${escapeHtml(entry.title)}</h3>
      <p class="code-meta">${escapeHtml(entry.sourceLabel)}</p>
      <pre><code>${escapeHtml(entry.code)}</code></pre>
      <a class="back-link" href="#top">Back to gallery</a>
    </article>`;
}

try {
  const [dslManifestRaw, sketchManifestRaw] = await Promise.all([
    fs.readFile(dslManifestPath, "utf8"),
    fs.readFile(sketchManifestPath, "utf8"),
  ]);

  const dslManifest = JSON.parse(dslManifestRaw);
  const sketchManifest = JSON.parse(sketchManifestRaw);

  const docSources = {};
  for (const [key, sourcePath] of Object.entries(docSourcePaths)) {
    docSources[key] = await fs.readFile(sourcePath, "utf8");
  }

  const codeEntries = [];

  const dslCards = (dslManifest.examples ?? []).map((example) => {
    const target = dslCodeTargets[example.id];
    if (!target) {
      throw new Error(`Missing DSL code mapping for example id: ${example.id}`);
    }
    const code = extractCodeBlock(docSources[target.doc], target.heading);
    if (!code) {
      throw new Error(
        `Missing code block for DSL example ${example.id} at ${target.doc} -> ${target.heading}`
      );
    }
    const anchor = `code-dsl-${example.id}`;
    codeEntries.push({
      anchor,
      title: `${example.title} (DSL)`,
      sourceLabel: `docs/reference/dsl/examples/${target.doc}.md -> ${target.heading}`,
      code,
    });
    return renderCard(example, anchor, classifyDsl(example.id));
  });

  const sketchCards = (sketchManifest.examples ?? []).map((example) => {
    const target = sketchCodeTargets[example.id];
    if (!target) {
      throw new Error(`Missing sketch code mapping for example id: ${example.id}`);
    }
    const code = extractCodeBlock(docSources[target.doc], target.heading);
    if (!code) {
      throw new Error(
        `Missing code block for sketch example ${example.id} at ${target.doc} -> ${target.heading}`
      );
    }
    const anchor = `code-sketch-${example.id}`;
    codeEntries.push({
      anchor,
      title: `${example.title} (Sketch)`,
      sourceLabel: `docs/reference/dsl/examples/${target.doc}.md -> ${target.heading}`,
      code,
    });
    return renderCard(example, anchor, "Sketch");
  });

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TrueForm Example Gallery</title>
    <style>
      :root {
        --bg: #0b1320;
        --panel: #111b2b;
        --text: #e7edf7;
        --muted: #9fb0c8;
        --accent: #4ec9b0;
        --border: #20324a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
        color: var(--text);
        background: radial-gradient(circle at top, #14243a, var(--bg) 48%);
      }
      main { max-width: 1280px; margin: 0 auto; padding: 28px 20px 56px; }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p.lead { margin: 0 0 24px; color: var(--muted); }
      .section-title { margin: 26px 0 12px; font-size: 20px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 14px;
      }
      .card {
        display: block;
        text-decoration: none;
        color: inherit;
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        background: var(--panel);
        transition: transform .12s ease, border-color .12s ease;
      }
      .card:hover { transform: translateY(-2px); border-color: var(--accent); }
      .card img { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; background: #0a111c; }
      .card-body { padding: 10px 12px; }
      .card-title { font-size: 14px; font-weight: 600; line-height: 1.35; }
      .card-meta { margin-top: 4px; font-size: 12px; color: var(--muted); }
      .code-list { margin-top: 36px; display: grid; gap: 16px; }
      .code-entry {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #0d1727;
        padding: 14px;
      }
      .code-entry h3 { margin: 0 0 6px; font-size: 17px; }
      .code-meta { margin: 0 0 10px; color: var(--muted); font-size: 12px; }
      .code-entry pre {
        margin: 0;
        padding: 12px;
        border-radius: 8px;
        overflow: auto;
        background: #070d17;
        border: 1px solid #1f2a3a;
      }
      .back-link {
        display: inline-block;
        margin-top: 10px;
        color: var(--accent);
        text-decoration: none;
        font-size: 13px;
      }
      @media (max-width: 720px) {
        main { padding: 20px 12px 42px; }
        h1 { font-size: 24px; }
      }
    </style>
  </head>
  <body>
    <main id="top">
      <h1>TrueForm Example Gallery</h1>
      <p class="lead">All rendered examples in one page. Click any tile to jump to the matching code snippet.</p>

      <h2 class="section-title">DSL Examples</h2>
      <section class="grid">${dslCards.join("\n")}
      </section>

      <h2 class="section-title">Sketch Examples</h2>
      <section class="grid">${sketchCards.join("\n")}
      </section>

      <h2 class="section-title">Example Code</h2>
      <section class="code-list">${codeEntries.map(renderCodeSection).join("\n")}
      </section>
    </main>
  </body>
</html>`;

  await fs.writeFile(path.join(examplesRoot, "index.html"), html, "utf8");

  console.log(
    JSON.stringify(
      {
        output: path.join(examplesRoot, "index.html"),
        dslCount: dslManifest.examples?.length ?? 0,
        sketchCount: sketchManifest.examples?.length ?? 0,
      },
      null,
      2
    )
  );
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Gallery HTML render failed:", error.message);
  if (error.stack) console.error(error.stack.split("\n").slice(0, 8).join("\n"));
  process.exit(1);
}
