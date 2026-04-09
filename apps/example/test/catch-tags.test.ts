import { describe, expect, it } from "@effect/vitest";
import { Layer, Logger, ManagedRuntime, Runtime } from "effect";
import { makeApiClientTag, makeCallApiPromise } from "effect-tanstack-start/client";
import { makeSsrApiClientLayer } from "effect-tanstack-start/server";
import { ApiContract, TodoNotFound } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { SessionStore } from "@/services/session-store";
import { TodosService } from "@/services/todos-service";

const ApiClient = makeApiClientTag(ApiContract);
const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);
const TestLayer = SsrApiClientLive.pipe(
  Layer.provideMerge(TodosService.Default),
  Layer.provideMerge(SessionStore.Default),
  Layer.provideMerge(Logger.pretty),
);

const testRuntime = ManagedRuntime.make(TestLayer);

describe("catchTags", () => {
  describe("global catchTags", () => {
    const NOT_FOUND_SIGNAL = { isNotFound: true };

    const callApi = makeCallApiPromise(ApiClient, () => testRuntime, {
      catchTags: {
        TodoNotFound: () => NOT_FOUND_SIGNAL,
      },
    });

    it("returns data on success", async () => {
      const todos = await callApi((api) => api.todos.list());
      expect(todos.length).toBeGreaterThan(0);
    });

    it("throws the handler's return value when a global tag matches", async () => {
      await expect(
        callApi((api) => api.todos.getById({ path: { id: "nonexistent" } })),
      ).rejects.toBe(NOT_FOUND_SIGNAL);
    });

    it("throws FiberFailure for unhandled errors", async () => {
      await expect(callApi((api) => api.auth.me())).rejects.toSatisfy((error) =>
        Runtime.isFiberFailure(error),
      );
    });
  });

  describe("per-call catchTags", () => {
    const callApi = makeCallApiPromise(ApiClient, () => testRuntime);

    it("throws the per-call handler's return value", async () => {
      const REDIRECT_SIGNAL = { isRedirect: true, to: "/login" };

      await expect(
        callApi((api) => api.auth.me(), {
          catchTags: {
            Unauthorized: () => REDIRECT_SIGNAL,
          },
        }),
      ).rejects.toBe(REDIRECT_SIGNAL);
    });

    it("does not intercept errors without a per-call handler", async () => {
      await expect(
        callApi((api) => api.todos.getById({ path: { id: "nonexistent" } })),
      ).rejects.toSatisfy((error) => Runtime.isFiberFailure(error));
    });
  });

  describe("per-call overrides global", () => {
    const GLOBAL_SIGNAL = { source: "global" };
    const PER_CALL_SIGNAL = { source: "per-call" };

    const callApi = makeCallApiPromise(ApiClient, () => testRuntime, {
      catchTags: {
        TodoNotFound: () => GLOBAL_SIGNAL,
      },
    });

    it("per-call handler wins over global for the same tag", async () => {
      await expect(
        callApi((api) => api.todos.getById({ path: { id: "nonexistent" } }), {
          catchTags: {
            TodoNotFound: () => PER_CALL_SIGNAL,
          },
        }),
      ).rejects.toBe(PER_CALL_SIGNAL);
    });
  });

  describe("handler receives the typed error", () => {
    const callApi = makeCallApiPromise(ApiClient, () => testRuntime);

    it("passes the error instance to the handler", async () => {
      let capturedError: unknown;

      await callApi((api) => api.todos.getById({ path: { id: "missing-123" } }), {
        catchTags: {
          TodoNotFound: (error) => {
            capturedError = error;
            return { handled: true };
          },
        },
      }).catch(() => {});

      expect(capturedError).toBeInstanceOf(TodoNotFound);
      expect((capturedError as TodoNotFound).id).toBe("missing-123");
    });
  });
});
