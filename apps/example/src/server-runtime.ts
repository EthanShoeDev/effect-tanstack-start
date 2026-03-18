import { Effect, Layer, Logger, ManagedRuntime } from "effect";
import { globalValue } from "effect/GlobalValue";
import { TodosService } from "@/api/todos-service";

// All server-only services go here.
const ServerLayer = Layer.mergeAll(TodosService.Default, Logger.pretty);

// globalValue ensures the runtime survives HMR reloads in development.
// The runtime is created once and reused across hot-reloaded modules.
export const serverRuntime = globalValue("effect-tanstack-start/ServerRuntime", () => {
  const runtime = ManagedRuntime.make(ServerLayer);
  process.on("SIGINT", () => {
    void runtime.dispose();
  });
  process.on("SIGTERM", () => {
    void runtime.dispose();
  });
  return runtime;
});

// Ephemeral layer that extracts the server runtime's context.
// Use this to provide server services to HttpApi handlers and other layers
// that need HMR-friendly access to the stateful runtime.
// See: https://github.com/mcrovero/effect-nextjs#stateful-layers
export const ServerEnvLayer = Layer.effectContext(
  serverRuntime.runtimeEffect.pipe(Effect.map((runtime) => runtime.context)),
);
