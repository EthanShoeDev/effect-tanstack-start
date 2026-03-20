import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
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
