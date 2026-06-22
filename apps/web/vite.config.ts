import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages repo path: https://sebuzdugan.github.io/CrossCheckAI/
// Override with BASE_PATH at build time if the repo is renamed.
const base = process.env.BASE_PATH ?? "/CrossCheckAI/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
