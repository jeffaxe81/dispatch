import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname;
const visualRoot = path.resolve(projectRoot, "tools", "gis-visual");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: visualRoot,
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "client", "src"),
      "@shared": path.resolve(projectRoot, "shared"),
      "@assets": path.resolve(projectRoot, "attached_assets"),
    },
  },
  server: {
    host: "127.0.0.1",
    fs: {
      strict: true,
      allow: [projectRoot],
    },
  },
});
