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
        command: "vp exec tsgo --noEmit",
        input: [{ auto: true }, "!**/*.tsbuildinfo"],
      },
    },
  },
});
