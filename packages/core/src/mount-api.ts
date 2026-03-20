/**
 * Creates a request handler that serves an Effect HttpApi via TanStack Start.
 *
 * Returns a single async handler function `({ request: Request }) => Promise<Response>`
 * that you can assign to every HTTP method in a splat route's `server.handlers`.
 */

import { Effect, Layer, type ManagedRuntime } from "effect";
import {
  HttpApiBuilder,
  HttpApp,
  HttpMiddleware,
  HttpServer,
  type HttpApi,
  type HttpApiGroup,
} from "@effect/platform";

export interface MountApiOptions<
  _ApiId extends string,
  _Groups extends HttpApiGroup.HttpApiGroup.Any,
  _ApiError,
  _ApiR,
> {
  /** The server ManagedRuntime. */
  readonly serverRuntime: ManagedRuntime.ManagedRuntime<any, any>;
  /** The composed API implementation Layer (HttpApiBuilder.api(Contract).pipe(...)). */
  readonly apiLayer: Layer.Layer<any, any, any>;
}

/**
 * Create a request handler for an Effect HttpApi.
 *
 * Returns an async function `({ request }) => Promise<Response>` suitable for
 * use in a TanStack Start splat route's `server.handlers`.
 *
 * The web handler is built lazily on first request and cached.
 *
 * @param api - Your HttpApi contract definition
 * @param options - Server runtime and API implementation layer
 *
 * @example
 * ```ts
 * // server-runtime.server.ts
 * export const apiHandler = mountApi(ApiContract, { serverRuntime, apiLayer: ApiImplLive })
 *
 * // routes/api.$.ts
 * export const Route = createFileRoute("/api/$")({
 *   server: {
 *     handlers: {
 *       GET: apiHandler, POST: apiHandler, PUT: apiHandler,
 *       PATCH: apiHandler, DELETE: apiHandler, OPTIONS: apiHandler,
 *     },
 *   },
 * })
 * ```
 */
export function mountApi<
  ApiId extends string,
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
>(
  _api: HttpApi.HttpApi<ApiId, Groups, ApiError, ApiR>,
  options: MountApiOptions<ApiId, Groups, ApiError, ApiR>,
): (args: { request: Request }) => Promise<Response> {
  // Build ServerEnvLayer internally — extracts the runtime's context so the
  // HttpApi handlers can access services (e.g. TodosService) from the runtime
  // without building them a second time.
  const serverEnvLayer = Layer.effectContext(
    options.serverRuntime.runtimeEffect.pipe(Effect.map((r: any) => r.context)),
  );

  const MyApiLive = (options.apiLayer as Layer.Layer<any, any, any>).pipe(
    Layer.provide(serverEnvLayer),
  );

  const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);

  let handlerPromise: Promise<(request: Request) => Promise<Response>> | undefined;

  function getApiHandler() {
    handlerPromise ??= (options.serverRuntime.runPromise as any)(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* options.serverRuntime.runtimeEffect;

          const fullLayer = (ApiLayer as Layer.Layer<any, any, any>).pipe(
            Layer.provideMerge(HttpApiBuilder.Router.Live),
            Layer.provideMerge(HttpApiBuilder.Middleware.layer),
          );
          const apiRuntime = yield* Layer.toRuntime(fullLayer);
          const app = yield* Effect.provide(HttpApiBuilder.httpApp, apiRuntime);

          return HttpApp.toWebHandlerRuntime(runtime)(
            HttpMiddleware.logger(app as HttpApp.Default),
          );
        }),
      ),
    );
    return handlerPromise;
  }

  return async ({ request }: { request: Request }) => {
    const handler = await getApiHandler();
    return handler!(request);
  };
}
