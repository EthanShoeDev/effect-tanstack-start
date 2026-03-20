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
  const ServerLayer = Layer.mergeAll(
    TodosService.Default,
    SessionStore.Default,
    SsrApiClientLive,
    Logger.pretty,
  );
  const runtime = ManagedRuntime.make(ServerLayer);
  process.on("SIGINT", () => void runtime.dispose());
  process.on("SIGTERM", () => void runtime.dispose());
  return runtime;
});

export const apiHandler = mountApi(ApiContract, { serverRuntime, apiLayer: ApiImplLive });
