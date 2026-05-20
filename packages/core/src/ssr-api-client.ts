/**
 * Creates a Layer providing the ApiClient key via direct handler invocation
 * for SSR. No HTTP types, no web Request/Response, no URL routing.
 *
 * Calls the same handler Effects that would serve HTTP requests,
 * but invokes them directly as Effect function calls.
 *
 * How it works (Effect v4):
 * 1. Builds the user's composed API layer (their group layer + HttpApiBuilder.layer(api))
 * 2. Reads each group's `{ routes }` entry directly from the built context — the group
 *    layer stores them under the group's key as part of its registration with the router.
 * 3. For each endpoint, creates a function that provides a minimal HttpServerRequest,
 *    RouteContext, and ParsedSearchParams to the route handler Effect and calls it.
 *
 * Why not go through the HttpRouter? The router uses FindMyWay internally for path
 * matching; we already know which route we want for each endpoint, so we can call its
 * handler directly and avoid the HTTP roundtrip entirely.
 *
 * The tradeoff is a small number of `as unknown as` casts where we provide our partial
 * HttpServerRequest implementation to the handler context. These are inherent to the
 * approach — we ARE providing a subset of the real interface. The Pick<> type alias
 * ensures we stay in sync with upstream changes.
 */

import { Context, Effect, Layer, Scope, Stream } from "effect";
import {
  Cookies,
  Headers,
  type HttpMethod,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { HttpApi, type HttpApiEndpoint, type HttpApiGroup } from "effect/unstable/httpapi";
import { getRequestHeaders } from "@tanstack/react-start/server";

/**
 * The subset of HttpServerRequest properties that our handler pipeline reads.
 * Derived from the real interface so changes upstream cause compile errors here.
 */
type SsrServerRequest = Pick<
  HttpServerRequest.HttpServerRequest,
  | "method"
  | "url"
  | "headers"
  | "cookies"
  | "json"
  | "text"
  | "arrayBuffer"
  | "multipart"
  | "multipartStream"
  | "urlParamsBody"
  | "modify"
>;

/** Properties we read from endpoints via HttpApi.reflect */
type ReflectedEndpoint = Pick<HttpApiEndpoint.AnyWithProps, "name" | "method" | "path">;

/** Properties we read from groups via HttpApi.reflect */
type ReflectedGroup = Pick<HttpApiGroup.AnyWithProps, "identifier" | "topLevel" | "key">;

/** Request shape that the generated client passes to endpoint functions */
interface EndpointRequest {
  readonly params?: Readonly<Record<string, string>>;
  readonly payload?: unknown;
  readonly query?: Readonly<Record<string, string | ReadonlyArray<string>>>;
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Get the forwarded headers from the current TanStack Start request.
 * Returns empty record if called outside a request context (e.g. during tests).
 */
const getForwardedHeaders: Effect.Effect<Record<string, string>> = Effect.try({
  try: () => {
    const raw = getRequestHeaders();
    return raw instanceof globalThis.Headers
      ? Object.fromEntries(raw.entries())
      : ((raw ?? {}) as Record<string, string>);
  },
  catch: () => ({}) as Record<string, string>,
}).pipe(Effect.catch(() => Effect.succeed({} as Record<string, string>)));

/**
 * Build a minimal HttpServerRequest for direct handler invocation.
 * Avoids full HTTP serialization while satisfying the handler pipeline's
 * reads from HttpServerRequest (headers, cookies, json, etc.).
 */
function buildSsrRequest(
  method: HttpMethod.HttpMethod,
  url: string,
  headers: Headers.Headers,
  payload: unknown,
): SsrServerRequest {
  return {
    method,
    url,
    headers,
    get cookies() {
      return Cookies.parseHeader(headers.cookie ?? "");
    },
    // Cast: HttpIncomingMessage types these as `Effect<Json | UrlParams | ..., HttpServerError>`.
    // We're never going to fail (we have the payload in hand), and the consumer just
    // reads the resolved value, so widening to the declared shape is safe here.
    json: Effect.succeed(payload) as unknown as HttpServerRequest.HttpServerRequest["json"],
    text: Effect.succeed(typeof payload === "string" ? payload : JSON.stringify(payload)),
    arrayBuffer: Effect.succeed(new ArrayBuffer(0)),
    multipart: Effect.succeed({} as never),
    multipartStream: Stream.empty,
    urlParamsBody: Effect.succeed(
      [],
    ) as unknown as HttpServerRequest.HttpServerRequest["urlParamsBody"],
    // Cast: modify's return type is the full HttpServerRequest (which includes branded
    // TypeId symbols and properties like `source`, `upgrade`, `stream` that we don't
    // implement). Safe because modify is only called by the middleware pipeline to
    // override url/headers — the returned request is used the same way as the original
    // (reading headers, cookies, json, etc.), all of which we implement.
    modify: (opts) =>
      buildSsrRequest(
        method,
        opts.url ?? url,
        opts.headers ?? headers,
        payload,
      ) as unknown as HttpServerRequest.HttpServerRequest,
  };
}

/**
 * Decode an HttpServerResponse body without serialising through HTTP. v4's
 * HttpApiBuilder encodes endpoint errors into response bodies with an error
 * status code (rather than leaving them in the Effect's failure channel), so
 * we re-elevate `status >= 400` back into `Effect.fail` to preserve the typed
 * error semantics callers expect.
 */
function extractResponseBody(response: unknown): Effect.Effect<unknown, unknown> {
  if (!HttpServerResponse.isHttpServerResponse(response)) {
    return Effect.succeed(response);
  }

  const decode = (): Effect.Effect<unknown, never> => {
    const body = response.body;
    if (body._tag === "Raw" && body.body != null) {
      return Effect.succeed(body.body);
    }
    if (body._tag === "Uint8Array") {
      // Already-encoded JSON from the response pipeline (Schema validation
      // happened in the handler). Plain JSON.parse is the right inverse here —
      // using Schema would re-validate already-validated data and would require
      // a schema we don't have on this side.
      return Effect.sync(() => {
        // @effect-diagnostics-next-line preferSchemaOverJson:off
        return JSON.parse(new TextDecoder().decode(body.body)) as unknown;
      });
    }
    return Effect.void;
  };

  return response.status >= 400 ? Effect.flatMap(decode(), Effect.fail) : decode();
}

/** Shape of the per-group data stored in the layer context by HttpApiBuilder.group */
interface GroupContextEntry {
  readonly routes: ReadonlyArray<HttpRouter.Route<unknown, unknown>>;
}

/**
 * Create a Layer that provides the ApiClient via direct SSR handler invocation.
 * Use this in the server-side runtime for zero-overhead SSR.
 *
 * Automatically forwards browser request headers (cookies, auth tokens) to
 * middleware via TanStack Start's `getRequestHeaders()`.
 *
 * @param api - Your HttpApi contract definition
 * @param apiImplLayer - The composed API implementation Layer
 *   (e.g. `Layer.mergeAll(HttpApiBuilder.layer(Contract), GroupLive)`)
 * @param clientTag - The ApiClient key (from makeApiClientTag)
 *
 * @example
 * ```ts
 * import { makeSsrApiClientLayer } from "effect-tanstack-start/server"
 *
 * const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient)
 * ```
 */
export function makeSsrApiClientLayer<
  ApiId extends string,
  Groups extends HttpApiGroup.Any,
  ImplOut,
  ImplErr,
  ImplIn,
  ClientTag extends Context.Service<any, any>,
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  apiImplLayer: Layer.Layer<ImplOut, ImplErr, ImplIn>,
  clientTag: ClientTag,
): Layer.Layer<Context.Service.Identifier<ClientTag>> {
  const makeClient = Effect.gen(function* () {
    // Build the full API layer. The user's apiImplLayer should already include
    // `HttpApiBuilder.layer(api)` merged with their group layer(s). `HttpApiBuilder.layer`
    // requires `HttpRouter`, so we provide it here. Use `provideMerge` (not `mergeAll`)
    // so the group layer can see HttpRouter in its effectContext closure — the routes
    // are constructed lazily inside each group layer and bake the surrounding services
    // into each handler via `Effect.provideContext`.
    const currentContext = yield* Effect.context<ImplIn>();
    const fullLayer = apiImplLayer.pipe(
      Layer.provideMerge(HttpRouter.layer),
      Layer.provideMerge(Layer.succeedContext(currentContext)),
    );

    const scope = yield* Scope.make();
    const apiContext = yield* Layer.buildWithScope(fullLayer, scope);

    // Index routes by "METHOD path". Each group layer stores its built routes under
    // `group.key` in the context as `{ routes, handlers }`. We can access those entries
    // directly via the unsafe context map without going through the HttpRouter.
    //
    // A missing entry means either (a) the user didn't `HttpApiBuilder.group(...)` this
    // group inside their apiImplLayer, or (b) we're built against an incompatible Effect
    // v4 beta and HttpApiBuilder has changed how/where it stashes group routes. Fail
    // loudly here at client-build time so the failure points at the cause instead of
    // surfacing later as a confusing per-endpoint "No route found" error.
    const routeIndex = new Map<string, HttpRouter.Route<unknown, unknown>>();
    for (const group of Object.values(api.groups) as unknown as Array<ReflectedGroup>) {
      const entry = apiContext.mapUnsafe.get(group.key) as GroupContextEntry | undefined;
      if (entry === undefined) {
        throw new Error(
          `effect-tanstack-start: no routes registered for HttpApiGroup "${group.identifier}" ` +
            `(context key "${group.key}"). Either your apiImplLayer is missing ` +
            `HttpApiBuilder.group(api, "${group.identifier}", ...), or this Effect beta is ` +
            `incompatible with effect-tanstack-start.`,
        );
      }
      for (const route of entry.routes) {
        routeIndex.set(`${route.method} ${route.path}`, route);
      }
    }

    // Build the client object using HttpApi.reflect
    const client: Record<
      string,
      | Record<string, (req?: EndpointRequest) => Effect.Effect<unknown, unknown>>
      | ((req?: EndpointRequest) => Effect.Effect<unknown, unknown>)
    > = {};

    HttpApi.reflect(api as unknown as HttpApi.AnyWithProps, {
      onGroup({ group }: { group: ReflectedGroup }) {
        if (!group.topLevel) {
          client[group.identifier] = {};
        }
      },
      onEndpoint({
        endpoint,
        group,
      }: {
        endpoint: HttpApiEndpoint.AnyWithProps;
        group: ReflectedGroup;
      }) {
        const ep: ReflectedEndpoint = endpoint;
        const route = routeIndex.get(`${ep.method} ${ep.path}`);
        if (route === undefined) {
          throw new Error(`No route found for ${ep.method} ${ep.path}`);
        }

        const endpointFn = (request?: EndpointRequest): Effect.Effect<unknown, unknown> =>
          Effect.flatMap(getForwardedHeaders, (forwarded) => {
            const pathParams = request?.params ?? {};
            const payload = request?.payload;
            const urlParams = request?.query ?? {};

            const headers = Headers.fromInput({
              ...forwarded,
              ...(request?.headers as Record<string, string>),
            });

            // Build URL with params substituted (for route matching context)
            let url: string = ep.path;
            for (const [key, value] of Object.entries(pathParams)) {
              url = url.replace(`:${key}`, String(value));
            }

            const ssrRequest = buildSsrRequest(ep.method, url, headers, payload);

            // Cast: the route.handler is typed `Effect<HttpServerResponse, E, R>` where R is
            // `unknown` from `Route<unknown, unknown>`. In practice the only services it
            // reads at runtime are the three request-scoped ones provided here plus
            // anything in the surrounding `apiContext` (HttpRouter, middleware, etc.).
            return Effect.provide(
              route.handler as Effect.Effect<
                unknown,
                unknown,
                | HttpServerRequest.HttpServerRequest
                | HttpRouter.RouteContext
                | HttpServerRequest.ParsedSearchParams
              >,
              Context.empty().pipe(
                // Cast: SsrServerRequest implements the Pick<> subset of HttpServerRequest
                // that the handler pipeline reads (method, url, headers, cookies, json,
                // text, urlParamsBody, modify). We don't implement source, upgrade, stream,
                // originalUrl, or the branded TypeId/IncomingMessage symbols because the
                // handler pipeline (securityDecode, requestPayload, schema decoding) never
                // accesses them. Safe as long as Effect's HttpApiBuilder handler chain
                // doesn't start reading those properties — the Pick<> type will cause a
                // compile error here if the upstream interface changes.
                Context.add(
                  HttpServerRequest.HttpServerRequest,
                  ssrRequest as unknown as HttpServerRequest.HttpServerRequest,
                ),
                // Cast: RouteContext requires a branded RouteContextTypeId symbol that
                // isn't publicly constructable. The handler only reads .params and .route.
                Context.add(HttpRouter.RouteContext, {
                  params: pathParams,
                  route,
                } as unknown as InstanceType<typeof HttpRouter.RouteContext>),
                Context.add(
                  HttpServerRequest.ParsedSearchParams,
                  urlParams as Readonly<Record<string, string | Array<string>>>,
                ),
              ),
            ).pipe(Effect.flatMap(extractResponseBody), Effect.provide(apiContext));
          });

        if (group.topLevel) {
          client[ep.name] = endpointFn;
        } else {
          (
            client[group.identifier] as Record<
              string,
              (req?: EndpointRequest) => Effect.Effect<unknown, unknown>
            >
          )[ep.name] = endpointFn;
        }
      },
    });

    return client as Context.Service.Shape<ClientTag>;
  });

  return Layer.effect(clientTag)(makeClient) as Layer.Layer<Context.Service.Identifier<ClientTag>>;
}
