import { defineConfig } from "vitepress";

export default defineConfig({
  title: "TrueForm",
  description: "Declarative, intent-first modeling on OpenCascade.js.",
  base: "/trueform/",
  themeConfig: {
    search: {
      provider: "local",
    },
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/architecture" },
      { text: "DSL", link: "/reference/dsl/" },
      { text: "API", link: "/reference/api" },
    ],
    sidebar: {
      "/guide/": [
        { text: "Getting Started", link: "/guide/getting-started" },
      ],
      "/reference/": [
        { text: "Architecture", link: "/reference/architecture" },
        {
          text: "DSL",
          items: [
            { text: "Overview", link: "/reference/dsl/" },
            { text: "Quickstart", link: "/reference/dsl/quickstart" },
            { text: "Gallery", link: "/reference/dsl/gallery" },
            { text: "Core", link: "/reference/dsl/core" },
            { text: "Assembly", link: "/reference/dsl/assembly" },
            { text: "Tolerancing", link: "/reference/dsl/tolerancing" },
            { text: "Geometry and Sketching", link: "/reference/dsl/geometry" },
            { text: "Features", link: "/reference/dsl/features" },
            { text: "Patterns", link: "/reference/dsl/patterns" },
            { text: "Generators", link: "/reference/dsl/generators" },
            { text: "Selectors, Predicates, Ranking", link: "/reference/dsl/selectors" },
            { text: "Examples", link: "/reference/dsl/examples/" },
          ],
        },
        { text: "API Reference", link: "/reference/api" },
      ],
    },
  },
});
