import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Logger } from "effect";
import { makeApiClientTag } from "effect-tanstack-start/client";
import { makeSsrApiClientLayer } from "effect-tanstack-start/server";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { SessionStoreLive } from "@/services/session-store";
import { TodosServiceLive } from "@/services/todos-service";

const ApiClient = makeApiClientTag(ApiContract);
const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);
const TestLayer = SsrApiClientLive.pipe(
  Layer.provideMerge(TodosServiceLive),
  Layer.provideMerge(SessionStoreLive),
  Layer.provideMerge(Logger.layer([Logger.consolePretty()])),
);

describe("SSR API client", () => {
  it.effect("search endpoint receives query params", () =>
    Effect.gen(function* () {
      const api = yield* ApiClient;

      // The seed data includes "Learn Effect", "Build something with TanStack Start", "Ship it"
      const results = yield* api.todos.search({ query: { q: "learn" } });
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("Learn Effect");

      // Search with no match
      const noResults = yield* api.todos.search({ query: { q: "nonexistent" } });
      expect(noResults).toHaveLength(0);

      // Search that matches multiple
      const multiResults = yield* api.todos.search({ query: { q: "i" } });
      // "Build something with TanStack Start" and "Ship it" both contain "i"
      expect(multiResults.length).toBeGreaterThanOrEqual(2);
    }).pipe(Effect.provide(TestLayer)),
  );
});
