import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { hmr: { port: 24679 } },
  build: { sourcemap: false },
});
