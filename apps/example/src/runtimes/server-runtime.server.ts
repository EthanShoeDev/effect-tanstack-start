import { Layer, Logger, ManagedRuntime } from "effect";
import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start/server";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { ApiClient } from "@/services/api-client-tag";
import { SessionStoreLive } from "@/services/session-store";
import { TodosServiceLive } from "@/services/todos-service";

const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

// Stateful services are provided here so that both the SSR client and
// the HTTP handler (mountApi) share the same instances.
const ServerLayer = SsrApiClientLive.pipe(
  Layer.provideMerge(TodosServiceLive),
  Layer.provideMerge(SessionStoreLive),
  Layer.provideMerge(Logger.layer([Logger.consolePretty()])),
);

export const serverRuntime = ManagedRuntime.make(ServerLayer);

process.on("SIGINT", () => void serverRuntime.dispose());
process.on("SIGTERM", () => void serverRuntime.dispose());

export const apiHandler = mountApi(ApiContract, { serverRuntime, apiLayer: ApiImplLive });
