import { Context, DateTime, Effect, Layer, Ref } from "effect";
import {
  type CreateTodoInput,
  type Todo,
  TodoNotFound,
  type UpdateTodoInput,
} from "@/api/api-contract";

interface TodosServiceShape {
  readonly list: Effect.Effect<ReadonlyArray<Todo>>;
  readonly getById: (id: string) => Effect.Effect<Todo, TodoNotFound>;
  readonly create: (input: CreateTodoInput) => Effect.Effect<Todo>;
  readonly update: (id: string, input: UpdateTodoInput) => Effect.Effect<Todo, TodoNotFound>;
  readonly remove: (id: string) => Effect.Effect<void, TodoNotFound>;
}

export class TodosService extends Context.Service<TodosService, TodosServiceShape>()(
  "TodosService",
) {}

const makeTodosService = Effect.gen(function* () {
  const seedTodos = new Map<string, Todo>([
    [
      "1",
      {
        id: "1",
        title: "Learn Effect",
        completed: true,
        createdAt: DateTime.makeUnsafe(0),
      },
    ],
    [
      "2",
      {
        id: "2",
        title: "Build something with TanStack Start",
        completed: false,
        createdAt: DateTime.makeUnsafe(0),
      },
    ],
    [
      "3",
      {
        id: "3",
        title: "Ship it",
        completed: false,
        createdAt: DateTime.makeUnsafe(0),
      },
    ],
  ]);
  const todosRef = yield* Ref.make<Map<string, Todo>>(seedTodos);
  // We can grep the client bundle to ensure this string is not included.
  const superSecretString = "SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET";

  const generateId = () => crypto.randomUUID();

  const list = Effect.map(Ref.get(todosRef), (todos) => Array.from(todos.values()));

  const getById = (id: string) =>
    Effect.gen(function* () {
      yield* Effect.log(superSecretString);
      const todos = yield* Ref.get(todosRef);
      const todo = todos.get(id);
      if (!todo) {
        return yield* new TodoNotFound({ id });
      }
      return todo;
    });

  const create = (input: CreateTodoInput) =>
    Effect.gen(function* () {
      const id = generateId();
      const now = yield* DateTime.now;
      const todo: Todo = {
        id,
        title: input.title,
        completed: false,
        createdAt: now,
      };
      yield* Ref.update(todosRef, (todos) => {
        const newTodos = new Map(todos);
        newTodos.set(id, todo);
        return newTodos;
      });
      return todo;
    });

  const update = (id: string, input: UpdateTodoInput) =>
    Effect.gen(function* () {
      const existing = yield* getById(id);
      const updated: Todo = {
        ...existing,
        title: input.title ?? existing.title,
        completed: input.completed ?? existing.completed,
      };
      yield* Ref.update(todosRef, (todos) => {
        const newTodos = new Map(todos);
        newTodos.set(id, updated);
        return newTodos;
      });
      return updated;
    });

  const remove = (id: string) =>
    Effect.gen(function* () {
      yield* getById(id);
      yield* Ref.update(todosRef, (todos) => {
        const newTodos = new Map(todos);
        newTodos.delete(id);
        return newTodos;
      });
    });

  return { list, getById, create, update, remove } satisfies TodosServiceShape;
});

export const TodosServiceLive = Layer.effect(TodosService)(makeTodosService);
