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
  lint: { options: { typeAware: true, typeCheck: true } },
});
