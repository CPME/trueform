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
  "extrude-surface": { doc: "features", heading: "Extrude" },
  "selection-ledger-extrude-review": { doc: "features", heading: "Extrude" },
  surface: { doc: "features", heading: "Surface" },
  "curve-intersect": { doc: "features", heading: "Curve Intersect (Staging)" },
  revolve: { doc: "features", heading: "Revolve" },
  "selection-ledger-revolve-review": { doc: "features", heading: "Revolve" },
  loft: { doc: "features", heading: "Loft" },
  sweep: { doc: "features", heading: "Sweep" },
  pipe: { doc: "features", heading: "Pipe" },
  "rib-web": { doc: "features", heading: "Rib/Web (Staging)" },
  "sweep-sketch": { doc: "features", heading: "Sweep (Arbitrary Sketch)" },
  hole: { doc: "features", heading: "Hole" },
  "hole-advanced": { doc: "features", heading: "Hole" },
  fillet: { doc: "features", heading: "Fillet" },
  "selection-ledger-fillet-edge-review": { doc: "features", heading: "Fillet" },
  "selection-ledger-fillet-seam-review": { doc: "features", heading: "Fillet" },
  "selection-ledger-stack-audit": { doc: "features", heading: "Fillet" },
  "variable-fillet": { doc: "features", heading: "Variable Fillet" },
  chamfer: { doc: "features", heading: "Chamfer" },
  "selection-ledger-chamfer-edge-review": { doc: "features", heading: "Chamfer" },
  "selection-ledger-chamfer-join-review": { doc: "features", heading: "Chamfer" },
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
  "unwrap-box": { doc: "features", heading: "Unwrap (Box Net)" },
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

function toExamplesRelativePath(imagePath) {
  if (typeof imagePath !== "string" || imagePath.length === 0) return imagePath;
  const marker = "/examples/";
  const markerIndex = imagePath.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return `./${imagePath.slice(markerIndex + marker.length)}`;
  }
  const plainPrefix = "examples/";
  if (imagePath.startsWith(plainPrefix)) {
    return `./${imagePath.slice(plainPrefix.length)}`;
  }
  return imagePath;
}

function renderCard(example, codeAnchor, category) {
  const title = escapeHtml(example.title);
  const image = escapeHtml(toExamplesRelativePath(example.image));
  return `
    <article class="card">
      <button
        class="card-image-button"
        type="button"
        data-preview-src="${image}"
        data-preview-title="${title}"
        aria-label="Open larger preview for ${title}"
      >
        <img src="${image}" alt="${title}" loading="lazy" />
      </button>
      <div class="card-body">
        <a class="card-title-link" href="#${codeAnchor}" data-code-target="${codeAnchor}">
          <div class="card-title">${title}</div>
          <div class="card-meta">${escapeHtml(category)}</div>
        </a>
      </div>
    </article>`;
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
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        background: var(--panel);
        transition: transform .12s ease, border-color .12s ease;
      }
      .card:hover { transform: translateY(-2px); border-color: var(--accent); }
      .card-image-button {
        display: block;
        width: 100%;
        padding: 0;
        border: 0;
        cursor: zoom-in;
        background: #0a111c;
      }
      .card-image-button img {
        display: block;
        width: 100%;
        aspect-ratio: 4/3;
        object-fit: cover;
        background: #0a111c;
      }
      .card-body { padding: 10px 12px; }
      .card-title-link {
        display: block;
        color: inherit;
        text-decoration: none;
      }
      .card-title { font-size: 14px; font-weight: 600; line-height: 1.35; }
      .card-meta { margin-top: 4px; font-size: 12px; color: var(--muted); }
      .code-list { margin-top: 36px; display: grid; gap: 16px; }
      .code-entry {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #0d1727;
        padding: 14px;
        scroll-margin-top: 24px;
        transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
      }
      .code-entry.is-active {
        border-color: rgba(78, 201, 176, 0.88);
        box-shadow: 0 0 0 1px rgba(78, 201, 176, 0.3);
        transform: translateY(-1px);
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
      .lightbox[hidden] { display: none; }
      .lightbox {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(4, 9, 16, 0.78);
        backdrop-filter: blur(6px);
      }
      .lightbox-panel {
        width: min(1100px, 100%);
        max-height: calc(100vh - 40px);
        border: 1px solid rgba(159, 176, 200, 0.2);
        border-radius: 18px;
        overflow: hidden;
        background: rgba(8, 13, 23, 0.96);
        box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
      }
      .lightbox-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(159, 176, 200, 0.14);
      }
      .lightbox-title { margin: 0; font-size: 15px; }
      .lightbox-close {
        padding: 8px 12px;
        border: 1px solid rgba(159, 176, 200, 0.24);
        border-radius: 999px;
        color: var(--text);
        background: transparent;
        cursor: pointer;
      }
      .lightbox-body {
        display: grid;
        place-items: center;
        padding: 16px;
        overflow: auto;
        max-height: calc(100vh - 120px);
        background:
          radial-gradient(circle at top, rgba(78, 201, 176, 0.08), transparent 42%),
          linear-gradient(180deg, rgba(16, 26, 40, 0.95), rgba(7, 13, 23, 0.98));
      }
      .lightbox-body img {
        display: block;
        max-width: 100%;
        max-height: calc(100vh - 180px);
        width: auto;
        height: auto;
        object-fit: contain;
      }
      @media (max-width: 720px) {
        main { padding: 20px 12px 42px; }
        h1 { font-size: 24px; }
        .lightbox { padding: 12px; }
        .lightbox-header { padding: 12px 14px; }
        .lightbox-body { padding: 12px; }
      }
    </style>
  </head>
  <body>
    <main id="top">
      <h1>TrueForm Example Gallery</h1>
      <p class="lead">Click an image for a larger preview, or click a feature title to jump to its matching code snippet.</p>

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
    <div class="lightbox" id="image-preview-modal" hidden>
      <div class="lightbox-panel" role="dialog" aria-modal="true" aria-labelledby="image-preview-title">
        <div class="lightbox-header">
          <h2 class="lightbox-title" id="image-preview-title">Example Preview</h2>
          <button class="lightbox-close" id="image-preview-close" type="button" aria-label="Close image preview">
            Close
          </button>
        </div>
        <div class="lightbox-body">
          <img id="image-preview-image" alt="" />
        </div>
      </div>
    </div>
    <script>
      (() => {
        const modal = document.getElementById("image-preview-modal");
        const previewImage = document.getElementById("image-preview-image");
        const previewTitle = document.getElementById("image-preview-title");
        const closeButton = document.getElementById("image-preview-close");
        const codeEntries = Array.from(document.querySelectorAll(".code-entry"));

        function clearActiveCode() {
          for (const entry of codeEntries) entry.classList.remove("is-active");
        }

        function activateCode(targetId) {
          const entry = document.getElementById(targetId);
          if (!entry) return;
          clearActiveCode();
          entry.classList.add("is-active");
          entry.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", "#" + targetId);
        }

        function closeModal() {
          if (!modal || !previewImage || !previewTitle) return;
          modal.hidden = true;
          previewImage.removeAttribute("src");
          previewImage.alt = "";
          previewTitle.textContent = "Example Preview";
        }

        document.querySelectorAll("[data-code-target]").forEach((link) => {
          link.addEventListener("click", (event) => {
            const targetId = link.getAttribute("data-code-target");
            if (!targetId) return;
            event.preventDefault();
            activateCode(targetId);
          });
        });

        document.querySelectorAll("[data-preview-src]").forEach((button) => {
          button.addEventListener("click", () => {
            const src = button.getAttribute("data-preview-src");
            const title = button.getAttribute("data-preview-title") || "Example Preview";
            if (!modal || !previewImage || !previewTitle || !src) return;
            previewImage.src = src;
            previewImage.alt = title;
            previewTitle.textContent = title;
            modal.hidden = false;
          });
        });

        closeButton?.addEventListener("click", closeModal);
        modal?.addEventListener("click", (event) => {
          if (event.target === modal) closeModal();
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && modal && !modal.hidden) {
            closeModal();
          }
        });

        if (window.location.hash.startsWith("#code-")) {
          activateCode(window.location.hash.slice(1));
        }
      })();
    </script>
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
