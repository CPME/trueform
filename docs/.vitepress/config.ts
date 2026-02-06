import { defineConfig } from "vitepress";

export default defineConfig({
  title: "TrueForm",
  description: "Declarative, intent-first modeling on OpenCascade.js.",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/architecture" },
      { text: "DSL", link: "/reference/dsl" },
      { text: "API", link: "/reference/api" },
    ],
    sidebar: {
      "/guide/": [
        { text: "Getting Started", link: "/guide/getting-started" },
      ],
      "/reference/": [
        { text: "Architecture", link: "/reference/architecture" },
        { text: "DSL Reference", link: "/reference/dsl" },
        { text: "API Reference", link: "/reference/api" },
      ],
    },
  },
});
