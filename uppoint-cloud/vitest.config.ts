import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
