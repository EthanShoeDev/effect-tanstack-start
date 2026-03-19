import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start";
import { Layer, Logger, ManagedRuntime } from "effect";
import { globalValue } from "effect/GlobalValue";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { TodosService } from "@/services/todos-service";
import { ApiClient } from "@/effect-tanstack";

const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

export const serverRuntime = globalValue("ServerRuntime", () => {
  const ServerLayer = Layer.mergeAll(TodosService.Default, SsrApiClientLive, Logger.pretty);
  const runtime = ManagedRuntime.make(ServerLayer);
  process.on("SIGINT", () => void runtime.dispose());
  process.on("SIGTERM", () => void runtime.dispose());
  return runtime;
});

const mountConfig = mountApi(ApiContract, { serverRuntime, apiLayer: ApiImplLive });

export const apiHandler = ({ request }: { request: Request }) =>
  mountConfig.server.handlers.GET({ request });
