import { describe, expect, it } from "@effect/vitest";
import { Layer, Logger, ManagedRuntime } from "effect";
import { makeApiClientTag, makeCallApiPromise } from "effect-tanstack-start/client";
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

const testRuntime = ManagedRuntime.make(TestLayer);

/**
 * v4 helper: callApiPromise rethrows whatever `Cause.squash` produces for
 * unmapped failures. For a tagged Fail cause, that's the underlying error
 * object — so unhandled errors surface as instances of the typed error class
 * rather than the v3 `FiberFailure` wrapper.
 */
const isTaggedError = (tag: string) => (error: unknown) =>
  typeof error === "object" && error !== null && (error as { _tag?: string })._tag === tag;

describe("throwOnTag", () => {
  describe("global throwOnTag", () => {
    const NOT_FOUND_SIGNAL = { isNotFound: true };

    const callApi = makeCallApiPromise(ApiClient, () => testRuntime, {
      throwOnTag: {
        TodoNotFound: () => NOT_FOUND_SIGNAL,
      },
    });

    it("returns data on success", async () => {
      const todos = await callApi((api) => api.todos.list());
      expect(todos.length).toBeGreaterThan(0);
    });

    it("throws the handler's return value when a global tag matches", async () => {
      await expect(
        callApi((api) => api.todos.getById({ params: { id: "nonexistent" } })),
      ).rejects.toBe(NOT_FOUND_SIGNAL);
    });

    it("rethrows the squashed cause for unhandled errors", async () => {
      await expect(callApi((api) => api.auth.me())).rejects.toSatisfy(
        isTaggedError("Unauthorized"),
      );
    });
  });

  describe("per-call throwOnTag", () => {
    const callApi = makeCallApiPromise(ApiClient, () => testRuntime);

    it("throws the per-call handler's return value", async () => {
      const REDIRECT_SIGNAL = { isRedirect: true, to: "/login" };

      await expect(
        callApi((api) => api.auth.me(), {
          throwOnTag: {
            Unauthorized: () => REDIRECT_SIGNAL,
          },
        }),
      ).rejects.toBe(REDIRECT_SIGNAL);
    });

    it("does not intercept errors without a per-call handler", async () => {
      await expect(
        callApi((api) => api.todos.getById({ params: { id: "nonexistent" } })),
      ).rejects.toSatisfy(isTaggedError("TodoNotFound"));
    });
  });

  describe("per-call overrides global", () => {
    const GLOBAL_SIGNAL = { source: "global" };
    const PER_CALL_SIGNAL = { source: "per-call" };

    const callApi = makeCallApiPromise(ApiClient, () => testRuntime, {
      throwOnTag: {
        TodoNotFound: () => GLOBAL_SIGNAL,
      },
    });

    it("per-call handler wins over global for the same tag", async () => {
      await expect(
        callApi((api) => api.todos.getById({ params: { id: "nonexistent" } }), {
          throwOnTag: {
            TodoNotFound: () => PER_CALL_SIGNAL,
          },
        }),
      ).rejects.toBe(PER_CALL_SIGNAL);
    });
  });

  describe("handler receives the typed error", () => {
    const callApi = makeCallApiPromise(ApiClient, () => testRuntime);

    it("passes the typed error payload to the handler", async () => {
      let capturedError: unknown;

      await callApi((api) => api.todos.getById({ params: { id: "missing-123" } }), {
        throwOnTag: {
          TodoNotFound: (error) => {
            capturedError = error;
            return { handled: true };
          },
        },
      }).catch(() => {});

      // In v4 the SSR path goes through the same response-encoding pipeline as the HTTP
      // path: the handler encodes the error to a JSON response body, and we re-decode
      // it on the way back. That gives us the same `_tag` + fields, but as a plain
      // object rather than a `TodoNotFound` class instance. We intentionally don't
      // schema-decode (we don't have a schema reference here and the values were
      // already validated server-side), so the contract for `throwOnTag` is "you get
      // the tagged error payload" — not "you get an `instanceof` of the error class".
      expect(capturedError).toMatchObject({ _tag: "TodoNotFound", id: "missing-123" });
    });
  });
});
