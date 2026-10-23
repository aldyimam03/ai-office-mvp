import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.VITE_PORT);
  const validPort = Number.isInteger(port) && port >= 1 && port <= 65535;
  // Hanya dev server yang butuh host/port eksplisit; `vite build` (mis. di CI)
  // harus jalan tanpa .env.
  if (command === "serve" && (!env.VITE_HOST || !validPort)) throw new Error("VITE_HOST and valid VITE_PORT are required");
  return {
    plugins: [react()],
    server: { host: env.VITE_HOST ?? "127.0.0.1", port: validPort ? port : 5173, strictPort: true },
    build: {
      // Bundle tunggal 1.2 MB memaksa browser mem-parse three.js sebelum panel tampil.
      // Pisahkan runtime 3D dari React supaya chunk utama di bawah 500 kB.
      rollupOptions: {
        output: {
          manualChunks: {
            three: ["three"],
            r3f: ["@react-three/fiber", "@react-three/drei"],
          },
        },
      },
    },
  };
});
