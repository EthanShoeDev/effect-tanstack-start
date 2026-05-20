/**
 * Creates a request handler that serves an Effect HttpApi via TanStack Start.
 *
 * Returns a single async handler function `({ request: Request }) => Promise<Response>`
 * that you can assign to every HTTP method in a splat route's `server.handlers`.
 */

import { type Context, Effect, Layer, type ManagedRuntime } from "effect";
import { HttpRouter } from "effect/unstable/http";
import type { HttpApi, HttpApiGroup } from "effect/unstable/httpapi";

export interface MountApiOptions {
  /** The server ManagedRuntime. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for ManagedRuntime variance
  readonly serverRuntime: ManagedRuntime.ManagedRuntime<any, any>;
  /**
   * The composed API implementation Layer. Should include `HttpApiBuilder.layer(api)`
   * merged with your group layers, e.g.
   * `Layer.mergeAll(HttpApiBuilder.layer(Contract), TodosGroupLive)`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for Layer variance
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
export function mountApi<ApiId extends string, Groups extends HttpApiGroup.Any>(
  _api: HttpApi.HttpApi<ApiId, Groups>,
  options: MountApiOptions,
): (args: { request: Request }) => Promise<Response> {
  // Build ServerEnvLayer internally — exposes the runtime's context to the
  // HttpApi handlers so services (e.g. TodosService) come from the runtime
  // without being built a second time.
  const serverEnvLayer = Layer.effectContext(
    options.serverRuntime.contextEffect.pipe(
      Effect.map((ctx: Context.Context<unknown>) => ctx as Context.Context<never>),
    ),
  );

  // Cast: `HttpApiBuilder.layer(api)` (inside `options.apiLayer`) declares `HttpRouter`
  // as a requirement so it can register routes with the router. We hand that off to
  // `HttpRouter.toWebHandler` below, which supplies `HttpRouter.layer` internally —
  // i.e. the unmet `HttpRouter.HttpRouter` requirement here is satisfied by
  // `toWebHandler`, not by us.
  const composedApiLayer = options.apiLayer.pipe(Layer.provide(serverEnvLayer)) as Layer.Layer<
    unknown,
    unknown,
    HttpRouter.HttpRouter
  >;

  // `HttpRouter.toWebHandler` lazily builds the layer (merging in `HttpRouter.layer`)
  // on first request, caches it, and returns a Fetch-compatible request handler.
  // It also wraps the chain with `HttpMiddleware.logger` by default, which preserves
  // the request logging that the v3 implementation set up explicitly. Pass
  // `disableLogger: true` to opt out if you wire logging elsewhere.
  let handlerCache: ((request: Request) => Promise<Response>) | undefined;

  function getHandler(): (request: Request) => Promise<Response> {
    if (handlerCache !== undefined) {
      return handlerCache;
    }
    const result = HttpRouter.toWebHandler(composedApiLayer);
    handlerCache = result.handler as (request: Request) => Promise<Response>;
    return handlerCache;
  }

  return async ({ request }: { request: Request }) => {
    return getHandler()(request);
  };
}
