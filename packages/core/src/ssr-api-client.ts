/**
 * Creates a Layer providing the ApiClient tag via direct handler invocation
 * for SSR. No HTTP types, no web Request/Response, no URL routing.
 *
 * Calls the same handler Effects that would serve HTTP requests,
 * but invokes them directly as Effect function calls.
 *
 * How it works:
 * 1. Builds the runtime from the composed API Layer (same as toWebHandler does)
 * 2. Extracts the HttpRouter from the runtime — it contains all registered routes
 * 3. For each endpoint, creates a function that provides a minimal context
 *    and calls the route handler Effect directly
 *
 * All unsafe casts are encapsulated here. The public API is fully typed.
 */

import { Context, Effect, Layer, Scope } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  type HttpApiGroup,
} from "@effect/platform";

/**
 * Create a Layer that provides the ApiClient via direct SSR handler invocation.
 * Use this in the server-side runtime for zero-overhead SSR.
 *
 * @param api - Your HttpApi contract definition
 * @param apiImplLayer - The composed API implementation Layer
 *   (e.g. HttpApiBuilder.api(Contract).pipe(Layer.provide(GroupLive)))
 * @param clientTag - The ApiClient tag (from makeApiClientTag)
 *
 * @example
 * ```ts
 * const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient)
 * ```
 */
export function makeSsrApiClientLayer<
  ApiId extends string,
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
  ClientTag extends Context.Tag<any, any>,
>(
  api: HttpApi.HttpApi<ApiId, Groups, ApiError, ApiR>,
  apiImplLayer: Layer.Layer<any, any, any>,
  clientTag: ClientTag,
): Layer.Layer<Context.Tag.Identifier<ClientTag>> {
  const makeClient = Effect.gen(function* () {
    // Build the full API layer with router and middleware, same as toWebHandler does.
    const fullLayer = (
      Layer.mergeAll(
        apiImplLayer,
        HttpApiBuilder.Router.Live,
        HttpApiBuilder.Middleware.layer,
      ) as Layer.Layer<any, any, any>
    ).pipe(Layer.provideMerge(Layer.succeedContext(yield* Effect.context<any>())));

    const scope = yield* Scope.make();
    const runtime = yield* Scope.extend(Layer.toRuntime(fullLayer), scope);
    const apiContext = runtime.context as Context.Context<any>;

    // Extract the Router service, then get the actual HttpRouter from it.
    // The Router tag provides a Service with a .router Effect, not the HttpRouter directly.
    const routerService = Context.unsafeGet(apiContext, HttpApiBuilder.Router as any);
    const router: HttpRouter.HttpRouter<any, any> = (yield* Effect.provide(
      (routerService as any).router,
      apiContext,
    )) as HttpRouter.HttpRouter<any, any>;

    // Index routes by "METHOD path" for direct lookup
    const routeIndex = new Map<string, HttpRouter.Route<any, any>>();
    for (const route of router.routes) {
      routeIndex.set(`${route.method} ${route.path}`, route);
    }

    // Build the client object using HttpApi.reflect
    const client: Record<string, Record<string, Function> | Function> = {};

    HttpApi.reflect(api as any, {
      onGroup({ group }) {
        if (!group.topLevel) {
          client[group.identifier] = {};
        }
      },
      onEndpoint({ endpoint, group }) {
        const ep = endpoint as any;
        const route = routeIndex.get(`${ep.method} ${ep.path}`);
        if (!route) {
          throw new Error(`No route found for ${ep.method} ${ep.path}`);
        }

        const endpointFn = (request: any) => {
          const pathParams = request?.path ?? {};
          const payload = request?.payload;
          const headers = request?.headers ?? {};

          // Build URL with params substituted (for route matching context)
          let url = ep.path as string;
          for (const [key, value] of Object.entries(pathParams)) {
            url = url.replace(`:${key}`, String(value));
          }

          // Minimal HttpServerRequest — just enough for the handler to read
          // path params (via RouteContext) and payload (via request.json).
          const fakeRequest: any = {
            method: ep.method,
            url,
            headers,
            json: Effect.succeed(payload),
            text: Effect.succeed(typeof payload === "string" ? payload : JSON.stringify(payload)),
            arrayBuffer: Effect.succeed(new ArrayBuffer(0)),
            multipart: Effect.succeed({}),
            multipartStream: Effect.succeed({}),
            urlParamsBody: Effect.succeed([]),
            modify: (opts: any) => ({ ...fakeRequest, ...opts }),
          };

          const routeContext = { route, params: pathParams };

          return Effect.provide(
            route.handler as Effect.Effect<any, any, any>,
            Context.empty().pipe(
              Context.add(HttpServerRequest.HttpServerRequest, fakeRequest),
              Context.add(HttpRouter.RouteContext, routeContext as any),
              Context.add(HttpServerRequest.ParsedSearchParams, {} as any),
            ),
          ).pipe(
            Effect.flatMap((response: any) => {
              if (HttpServerResponse.isServerResponse(response)) {
                const body = response.body;
                if (body._tag === "Raw" && body.body != null) {
                  return Effect.succeed(body.body);
                }
                if (body._tag === "Uint8Array") {
                  return Effect.try(() => JSON.parse(new TextDecoder().decode(body.body)));
                }
                return Effect.succeed(undefined);
              }
              return Effect.succeed(response);
            }),
            Effect.provide(apiContext),
          );
        };

        if (group.topLevel) {
          client[ep.name] = endpointFn;
        } else {
          (client[group.identifier] as Record<string, Function>)[ep.name] = endpointFn;
        }
      },
    });

    return client as Context.Tag.Service<ClientTag>;
  });

  return Layer.effect(clientTag, makeClient) as Layer.Layer<Context.Tag.Identifier<ClientTag>>;
}
