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
    // @effect/vitest re-exports vitest APIs via `export * from "vitest"`.
    // In projects mode, vitest externalizes node_modules by default, so that
    // re-export resolves to the raw package instead of the runner-contextualized
    // API, crashing `describe`/`it`. Inlining forces the module runner to
    // transform the import so the runner context is available.
    server: {
      deps: {
        inline: ["@effect/vitest"],
      },
    },
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
