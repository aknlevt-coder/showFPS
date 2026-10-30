import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  // Tek sürüm kaynağı package.json (tauri.conf.json da buradan okur).
  // Derleme zamanı: aynı sürüm numarasıyla iki paket çıkarsa da hangisinin kurulu olduğu anlaşılsın.
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // helper/ (dotnet obj/bin) izlenirse kilitli geçici dosyalarda EBUSY ile çöker.
    watch: { ignored: ["**/src-tauri/**", "**/helper/**"] },
  },
  build: { target: "chrome105" },
});