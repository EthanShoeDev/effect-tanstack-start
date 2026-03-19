/**
 * Helper to mount an Effect HttpApi on a TanStack Start splat route.
 * Returns a route config object with all HTTP method handlers wired up.
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
 * Mount an Effect HttpApi on a TanStack Start splat route.
 *
 * Returns `{ server: { handlers: { GET, POST, ... } } }` — pass this
 * directly to `createFileRoute(path)(...)`.
 *
 * @param api - Your HttpApi contract definition
 * @param options - Server runtime and API implementation layer
 *
 * @example
 * ```ts
 * export const Route = createFileRoute("/api/$")(
 *   mountApi(ApiContract, { runtime: serverRuntime, apiLayer: ApiImplLive })
 * )
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
) {
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

  const effectHandler = async ({ request }: { request: Request }) => {
    const handler = await getApiHandler();
    return handler!(request);
  };

  return {
    server: {
      handlers: {
        GET: effectHandler,
        POST: effectHandler,
        PUT: effectHandler,
        PATCH: effectHandler,
        DELETE: effectHandler,
        OPTIONS: effectHandler,
      },
    },
  };
}
