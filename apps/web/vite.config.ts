import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves from /<repo>/. Override with BASE_PATH for a custom domain or root.
const base = process.env.BASE_PATH ?? "/CrossCheckAI/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { target: "es2022", outDir: "dist", sourcemap: false },
});
