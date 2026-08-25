import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: process.env.RUN_QDRANT_INTEGRATION === "1"
      ? []
      : ["**/*.integration.test.ts"],
    testTimeout: 30_000,
  },
});
