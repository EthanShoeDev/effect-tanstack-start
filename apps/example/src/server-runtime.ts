import { Effect, Layer, Logger, ManagedRuntime } from "effect";
import { globalValue } from "effect/GlobalValue";
import { TodosService } from "@/api/todos-service";
import { InProcessDirectCallApiClientLive } from "@/api-client/in-process-direct-call";

// The direct-call ApiClient needs TodosService (handlers depend on it).
// Swap this import to try other SSR approaches:
//   import { InProcessWebHandlerApiClientLive } from "@/api-client/in-process-web-handler";
//   import { InProcessEffectDirectApiClientLive } from "@/api-client/in-process-effect-direct";
const ServerLayer = Layer.mergeAll(TodosService.Default, Logger.pretty).pipe(
  Layer.provideMerge(InProcessDirectCallApiClientLive),
);

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

export const ServerEnvLayer = Layer.effectContext(
  serverRuntime.runtimeEffect.pipe(Effect.map((runtime) => runtime.context)),
);
