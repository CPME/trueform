# Examples App

<script setup>
import { withBase } from "vitepress";

const examplesAppHref = withBase("/examples/index.html");
</script>

Open the standalone examples app directly:

<a :href="examplesAppHref" target="_blank" rel="noreferrer">Open Examples App</a>

<iframe
  :src="examplesAppHref"
  style="width: 100%; height: 80vh; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft);"
  title="TrueForm Examples App"
></iframe>
