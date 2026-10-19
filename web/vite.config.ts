import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.VITE_PORT);
  if (!env.VITE_HOST || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("VITE_HOST and valid VITE_PORT are required");
  return { plugins: [react()], server: { host: env.VITE_HOST, port, strictPort: true } };
});
