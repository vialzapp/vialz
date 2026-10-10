import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "",
  define: {
    __API_URL__: JSON.stringify(process.env.VITE_API_URL ?? (mode === "development" ? "http://localhost:8787" : "https://vialz.xyz")),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: mode === "development",
    rollupOptions: {
      input: { popup: "popup.html" },
    },
  },
}));
