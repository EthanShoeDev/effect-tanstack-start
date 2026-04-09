import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
  server: {
    watch: {
      ignored: ["**/docs/cloned-repos-as-docs/**"],
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["**/*.gen.*"],
  },
  lint: {
    ignorePatterns: ["**/*.gen.*"],
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    tasks: {
      // vp check (fmt + lint + tsgo typecheck) + Effect lints via @effect/tsgo
      "check-all": {
        command: "vp check",
        dependsOn: ["effect-tanstack-start#typecheck", "example#typecheck"],
      },
      "check-all:fix": {
        command: "vp check --fix",
        dependsOn: ["effect-tanstack-start#typecheck", "example#typecheck"],
      },
      // Orchestrates all checks in parallel, then builds
      ready: {
        command: "vp run example#build",
        dependsOn: ["check-all", "effect-tanstack-start#test", "example#test"],
      },
    },
  },
});
