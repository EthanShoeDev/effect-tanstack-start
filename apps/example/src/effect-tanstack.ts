/**
 * Effect + TanStack Start integration registration.
 *
 * This is the single file that wires up the API with effect-tanstack-start.
 * Import from here throughout the app.
 */

import {
  makeApiClientTag,
  makeSsrApiClientLayer,
  makeHttpApiClientLayer,
  makeCallApiPromise,
} from "effect-tanstack-start";
import { Layer, Logger, ManagedRuntime } from "effect";
import { globalValue } from "effect/GlobalValue";
import { createIsomorphicFn } from "@tanstack/react-start";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { TodosService } from "@/services/todos-service";

// 1. Create the shared ApiClient tag (typed from the contract)
export const ApiClient = makeApiClientTag(ApiContract);

// 2. Create the SSR layer (direct handler invocation, no HTTP)
export const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

// 3. Create the HTTP layer (for browser, calls the splat route)
export const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient);

// 4. Build the server runtime — user composes whatever services they need.
//    globalValue ensures the runtime survives HMR reloads in development.
export const serverRuntime = globalValue("ServerRuntime", () => {
  const ServerLayer = Layer.mergeAll(TodosService.Default, SsrApiClientLive, Logger.pretty);
  const runtime = ManagedRuntime.make(ServerLayer);
  process.on("SIGINT", () => void runtime.dispose());
  process.on("SIGTERM", () => void runtime.dispose());
  return runtime;
});

// 5. Build the client runtime
export const clientRuntime = globalValue("ClientRuntime", () =>
  ManagedRuntime.make(Layer.mergeAll(HttpApiClientLive, Logger.pretty)),
);

// 6. Isomorphic runtime getter — picks server or client at compile time.
//    TanStack Start's Vite plugin strips the unused branch from each bundle.
export const getRuntime = createIsomorphicFn()
  .server(() => serverRuntime)
  .client(() => clientRuntime);

// 7. Convenience helper — picks the right runtime, yields the ApiClient, runs the effect.
//    Use in loaders and event handlers for a clean one-liner.
export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime);
