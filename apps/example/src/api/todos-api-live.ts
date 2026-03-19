import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { DomainApi } from "./domain-api";
import { TodosService } from "./todos-service";

// Handler builder extracted so the direct-call SSR client can access the
// same handler Effects without going through HTTP. HttpApiBuilder.group
// also calls this internally to register routes.
export function buildTodosHandlers(handlers: any) {
  return handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.list;
      }),
    )
    .handle("getById", ({ path }: any) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.getById(path.id);
      }),
    )
    .handle("create", ({ payload }: any) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.create(payload);
      }),
    )
    .handle("update", ({ path, payload }: any) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.update(path.id, payload);
      }),
    )
    .handle("remove", ({ path }: any) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.remove(path.id);
      }),
    );
}

export const TodosApiLive = HttpApiBuilder.group(DomainApi, "todos", buildTodosHandlers).pipe(
  Layer.provide(TodosService.Default),
);
