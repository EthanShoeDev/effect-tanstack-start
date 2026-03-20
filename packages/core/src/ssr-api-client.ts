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
 * Why not use fromWeb/toWebHandler? That would re-introduce the full
 * JSON.stringify → HTTP routing → JSON.parse roundtrip. Our approach
 * passes the payload object directly (no serialization) and extracts
 * the response body directly (no deserialization).
 *
 * The tradeoff is a small number of `as unknown as` casts where we provide
 * our partial HttpServerRequest implementation to the handler context.
 * These are inherent to the approach — we ARE providing a subset of the
 * real interface. The Pick<> type alias ensures we stay in sync with
 * upstream changes.
 */

import { Context, Effect, Layer, Scope, Stream } from "effect";
import type { HttpMethod } from "@effect/platform";
import {
  Cookies,
  Headers,
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
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
type ReflectedEndpoint = Pick<
  HttpApiEndpoint.HttpApiEndpoint.AnyWithProps,
  "name" | "method" | "path"
>;

/** Properties we read from groups via HttpApi.reflect */
type ReflectedGroup = Pick<HttpApiGroup.HttpApiGroup.AnyWithProps, "identifier" | "topLevel">;

/** Request shape that the generated client passes to endpoint functions */
interface EndpointRequest {
  readonly path?: Readonly<Record<string, string>>;
  readonly payload?: unknown;
  readonly urlParams?: Readonly<Record<string, string | ReadonlyArray<string>>>;
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
}).pipe(Effect.catchAll(() => Effect.succeed({} as Record<string, string>)));

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
    json: Effect.succeed(payload),
    text: Effect.succeed(typeof payload === "string" ? payload : JSON.stringify(payload)),
    arrayBuffer: Effect.succeed(new ArrayBuffer(0)),
    multipart: Effect.succeed({} as never),
    multipartStream: Stream.empty,
    urlParamsBody: Effect.succeed([]),
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
 * Extract the response body from an HttpServerResponse.
 * Handles the different body tag types without JSON roundtrip.
 */
function extractResponseBody(response: unknown): Effect.Effect<unknown, never> {
  if (HttpServerResponse.isServerResponse(response)) {
    const body = response.body;
    if (body._tag === "Raw" && body.body != null) {
      return Effect.succeed(body.body);
    }
    if (body._tag === "Uint8Array") {
      // Uint8Array body is already-encoded JSON from the response pipeline.
      // We must decode it here since we're bypassing HTTP transport.
      // Schema validation already happened in the handler — this is just deserialization.
      return Effect.orDie(
        Effect.try(() => JSON.parse(new TextDecoder().decode(body.body)) as unknown),
      );
    }
    return Effect.void;
  }
  return Effect.succeed(response);
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
 *   (e.g. HttpApiBuilder.api(Contract).pipe(Layer.provide(GroupLive)))
 * @param clientTag - The ApiClient tag (from makeApiClientTag)
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
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
  ImplOut,
  ImplErr,
  ImplIn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for Context.Tag variance
  ClientTag extends Context.Tag<any, any>,
>(
  api: HttpApi.HttpApi<ApiId, Groups, ApiError, ApiR>,
  apiImplLayer: Layer.Layer<ImplOut, ImplErr, ImplIn>,
  clientTag: ClientTag,
): Layer.Layer<Context.Tag.Identifier<ClientTag>> {
  const makeClient = Effect.gen(function* () {
    // Build the full API layer with router and middleware, same as toWebHandler does.
    // We merge the current context (from the runtime that provides this layer)
    // so that services like SessionStore are available to the API handlers.
    const currentContext = yield* Effect.context<ImplIn>();
    const fullLayer = Layer.mergeAll(
      apiImplLayer,
      HttpApiBuilder.Router.Live,
      HttpApiBuilder.Middleware.layer,
    ).pipe(Layer.provideMerge(Layer.succeedContext(currentContext)));

    const scope = yield* Scope.make();
    const runtime = yield* Scope.extend(Layer.toRuntime(fullLayer), scope);
    const apiContext = runtime.context;

    // Extract the Router service, then get the actual HttpRouter from it.
    const routerService = Context.get(apiContext, HttpApiBuilder.Router);
    const router = yield* Effect.provide(routerService.router, apiContext);

    // Index routes by "METHOD path" for direct lookup
    const routeIndex = new Map<string, HttpRouter.Route<unknown, unknown>>();
    for (const route of router.routes) {
      routeIndex.set(`${route.method} ${route.path}`, route);
    }

    // Build the client object using HttpApi.reflect
    const client: Record<
      string,
      | Record<string, (req: EndpointRequest) => Effect.Effect<unknown, unknown>>
      | ((req: EndpointRequest) => Effect.Effect<unknown, unknown>)
    > = {};

    HttpApi.reflect(
      api as HttpApi.HttpApi<string, HttpApiGroup.HttpApiGroup.Any, unknown, unknown>,
      {
        onGroup({ group }: { group: ReflectedGroup }) {
          if (!group.topLevel) {
            client[group.identifier] = {};
          }
        },
        onEndpoint({
          endpoint,
          group,
        }: {
          endpoint: HttpApiEndpoint.HttpApiEndpoint<string, HttpMethod.HttpMethod>;
          group: ReflectedGroup;
        }) {
          const ep: ReflectedEndpoint = endpoint;
          const route = routeIndex.get(`${ep.method} ${ep.path}`);
          if (!route) {
            throw new Error(`No route found for ${ep.method} ${ep.path}`);
          }

          const endpointFn = (request: EndpointRequest): Effect.Effect<unknown, unknown> =>
            Effect.flatMap(getForwardedHeaders, (forwarded) => {
              const pathParams = request?.path ?? {};
              const payload = request?.payload;
              const urlParams = request?.urlParams ?? {};

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
                  // isn't publicly constructable. The handler only reads .params and .route,
                  // both of which we provide. Safe because HttpApiBuilder's handler chain
                  // (line ~678 in HttpApiBuilder.ts) does Context.unsafeGet(RouteContext)
                  // and only accesses .params for path parameter decoding.
                  Context.add(HttpRouter.RouteContext, {
                    params: pathParams,
                    route,
                  } as unknown as HttpRouter.RouteContext),
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
                (req: EndpointRequest) => Effect.Effect<unknown, unknown>
              >
            )[ep.name] = endpointFn;
          }
        },
      },
    );

    return client as Context.Tag.Service<ClientTag>;
  });

  return Layer.effect(clientTag, makeClient) as Layer.Layer<Context.Tag.Identifier<ClientTag>>;
}
