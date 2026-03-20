import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start/server";
import { Layer, Logger, ManagedRuntime } from "effect";
import { globalValue } from "effect/GlobalValue";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { SessionStore } from "@/services/session-store";
import { TodosService } from "@/services/todos-service";
import { ApiClient } from "@/services/api-client-tag";

const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

export const serverRuntime = globalValue("ServerRuntime", () => {
  // Stateful services are provided here so that both the SSR client and
  // the HTTP handler (mountApi) share the same instances.
  const ServerLayer = SsrApiClientLive.pipe(
    Layer.provideMerge(TodosService.Default),
    Layer.provideMerge(SessionStore.Default),
    Layer.provideMerge(Logger.pretty),
  );
  const runtime = ManagedRuntime.make(ServerLayer);
  process.on("SIGINT", () => void runtime.dispose());
  process.on("SIGTERM", () => void runtime.dispose());
  return runtime;
});

export const apiHandler = mountApi(ApiContract, { serverRuntime, apiLayer: ApiImplLive });
