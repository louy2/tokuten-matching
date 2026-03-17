import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/ui/__tests__/setup.ts"],
    include: ["src/ui/__tests__/**/*.test.{ts,tsx}"],
    css: false,
  },
});
