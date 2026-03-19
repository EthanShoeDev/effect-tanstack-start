import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect, Option } from "effect";
import { useState } from "react";
import { ApiClient } from "@/api-client/shared";
import { clientRuntime } from "@/client-runtime";

// createIsomorphicFn selects the runtime at compile time.
// Server: uses serverRuntime (in-process ApiClient, no HTTP).
// Client: uses clientRuntime (HTTP-based ApiClient).
const getRuntime = createIsomorphicFn()
  .server(async () => {
    const { serverRuntime } = await import("@/server-runtime");
    return serverRuntime;
  })
  .client(() => clientRuntime);

export const Route = createFileRoute("/")({
  loader: async () => {
    const runtime = await getRuntime();
    const todos = await runtime.runPromise(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        return yield* api.todos.list();
      }),
    );
    return { todos: todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })) };
  },
  component: Todos,
});

function Todos() {
  const { todos: initialTodos } = useLoaderData({ from: "/" });
  const [todos, setTodos] = useState(initialTodos);
  const [title, setTitle] = useState("");

  const fetchTodos = async () => {
    const result = await clientRuntime.runPromise(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        return yield* api.todos.list();
      }),
    );
    setTodos(result.map((t) => ({ id: t.id, title: t.title, completed: t.completed })));
  };

  const addTodo = async () => {
    if (!title.trim()) return;
    await clientRuntime.runPromise(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        yield* api.todos.create({ payload: { title } });
      }),
    );
    setTitle("");
    await fetchTodos();
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    await clientRuntime.runPromise(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        yield* api.todos.update({
          path: { id: id as never },
          payload: { title: Option.none(), completed: Option.some(!completed) },
        });
      }),
    );
    await fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await clientRuntime.runPromise(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        yield* api.todos.remove({ path: { id: id as never } });
      }),
    );
    await fetchTodos();
  };

  return (
    <div style={{ padding: 8 }}>
      <h3>Todos</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="Add a todo..."
        />
        <button onClick={addTodo}>Add</button>
        <button onClick={fetchTodos}>Refresh</button>
      </div>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
            />
            <span style={{ textDecoration: todo.completed ? "line-through" : "none" }}>
              {todo.title}
            </span>
            <button onClick={() => deleteTodo(todo.id)}>x</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
