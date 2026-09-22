import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Antes era "::" (todas as interfaces), o que expunha o servidor de
    // desenvolvimento para a rede local inteira. Com o CVE do esbuild
    // (GHSA-67mh-4wv8-2f99), qualquer máquina do Wi-Fi conseguia ler o
    // código-fonte servido pelo dev server. Escute só no localhost.
    host: "localhost",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
