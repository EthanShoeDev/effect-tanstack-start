import { defineConfig } from "vite-plus";

export default defineConfig({
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
});
