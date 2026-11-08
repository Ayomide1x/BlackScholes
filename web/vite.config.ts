import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // In development, /api goes to the calibration API run locally on port 8000.
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
