import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite-plus";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import path from "path";

export default defineConfig({
  build: {
    minify: false,
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  plugins: process.env.VITEST
    ? []
    : [
        tanstackStart({
          srcDirectory: "src",
        }),
        viteReact(),
        nitro(),
      ],
  test: {
    include: ["test/**/*.test.ts"],
  },
  run: {
    tasks: {
      typecheck: {
        command: "tsgo --noEmit",
        input: [{ auto: true }, "!**/*.tsbuildinfo"],
      },
      "typecheck:tsc": {
        command: "tsc --noEmit",
        input: [{ auto: true }, "!**/*.tsbuildinfo"],
      },
    },
  },
});
