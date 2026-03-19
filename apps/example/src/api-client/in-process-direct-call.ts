/**
 * SSR ApiClient: direct-call approach (most optimized).
 *
 * Does NOT use HttpApiClient or any HTTP types. Instead, calls the SAME
 * handler functions registered via HttpApiBuilder.group().handle() directly
 * as Effect function calls.
 *
 * What makes this genuinely different:
 * - NO web Request/Response objects
 * - NO URL routing or HTTP method matching
 * - NO JSON serialization/deserialization
 * - NO HttpServerRequest, HttpApp, or HttpClient
 * - Calls the actual handler Effects — not the underlying services
 * - Schema validation runs on inputs via the endpoint's decode schemas
 *
 * How it works:
 * The handler build function (buildTodosHandlers) is extracted from
 * todos-api-live.ts and shared between HttpApiBuilder.group (for HTTP)
 * and this direct client (for SSR). We call the same build function to
 * get the Handlers object, then for each endpoint we:
 * 1. Decode input using the endpoint's schemas (same runtime validation)
 * 2. Call the handler Effect directly (same Effect as the HTTP path)
 * 3. Return the result — no response encoding needed
 *
 * This is the zero-overhead equivalent of what TanStack Start's
 * createServerFn does at SSR time — calling the handler as a plain
 * function, not over HTTP.
 *
 * Overhead: Schema validation only. No HTTP abstractions.
 * Middleware: Not yet applied. See TODO in implementation-notes.md.
 */

import { Chunk, Context, Effect, Layer, Option, Schema } from "effect";
import { HttpApi, HttpApiEndpoint } from "@effect/platform";
import { DomainApi } from "@/api/domain-api";
import { buildTodosHandlers } from "@/api/todos-api-live";
import type { DomainApiClient } from "./shared";
import { ApiClient } from "./shared";

const makeDirectClient = Effect.gen(function* () {
  const context = yield* Effect.context<never>();

  // Get the group definition from the API
  const group = (DomainApi as any).groups.todos;

  // Re-run the same build function that HttpApiBuilder.group uses internally.
  // This gives us the Handlers object with the actual handler Effects.
  // We replicate what HttpApiBuilder does at line 484: build(makeHandlers({group, handlers: Chunk.empty()}))
  // Since makeHandlers is not exported, we use HttpApiBuilder.group's own
  // mechanism — but we only need the Handlers object, not the Layer.
  const emptyHandlers = {
    group,
    handlers: Chunk.empty(),
    handle(this: any, name: string, handler: Function, options?: any) {
      const endpoint = this.group.endpoints[name];
      return {
        ...this,
        handlers: Chunk.append(this.handlers, {
          endpoint,
          handler,
          withFullRequest: false,
          uninterruptible: options?.uninterruptible ?? false,
        }),
        handle: this.handle,
      };
    },
  };

  const builtHandlers = buildTodosHandlers(emptyHandlers);

  // Index handlers by endpoint name
  const handlerMap = new Map<
    string,
    { endpoint: HttpApiEndpoint.HttpApiEndpoint.AnyWithProps; handler: Function }
  >();
  for (const item of builtHandlers.handlers) {
    const endpoint = item.endpoint as HttpApiEndpoint.HttpApiEndpoint.AnyWithProps;
    handlerMap.set(endpoint.name, { endpoint, handler: item.handler });
  }

  // For each endpoint, create a function that decodes input using the
  // endpoint's schemas and calls the handler Effect directly.
  function makeEndpointFn(endpointName: string) {
    const entry = handlerMap.get(endpointName);
    if (!entry) throw new Error(`No handler for endpoint: ${endpointName}`);
    const { endpoint, handler } = entry;

    const decodePath = Option.map(endpoint.pathSchema, Schema.decodeUnknown);
    const decodePayload = Option.map(endpoint.payloadSchema, Schema.decodeUnknown);

    return (request: any) =>
      Effect.gen(function* () {
        const decoded: any = {};
        if (decodePath._tag === "Some" && request?.path) {
          decoded.path = yield* decodePath.value(request.path);
        }
        if (decodePayload._tag === "Some" && request?.payload) {
          decoded.payload = yield* decodePayload.value(request.payload);
        }
        // Call the actual handler Effect — same function as HTTP path uses
        return yield* (Effect.mapInputContext as any)(
          (handler as Function)(decoded),
          (input: Context.Context<never>) => Context.merge(context, input),
        );
      });
  }

  // Build the client object matching the HttpApiClient shape
  const client: Record<string, Record<string, Function>> = {};
  HttpApi.reflect(DomainApi as any, {
    onGroup({ group: g }) {
      if (!(g as any).topLevel) {
        client[g.identifier] = {};
      }
    },
    onEndpoint({ endpoint, group: g }) {
      const fn = makeEndpointFn((endpoint as any).name);
      if ((g as any).topLevel) {
        client[(endpoint as any).name] = fn as any;
      } else {
        client[g.identifier]![(endpoint as any).name] = fn;
      }
    },
  });

  return client as unknown as DomainApiClient;
});

export const InProcessDirectCallApiClientLive = Layer.effect(ApiClient, makeDirectClient);
