import { createFileRoute } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { useState } from "react";
import { ApiClient, clientRuntime } from "@/client-runtime";

export const Route = createFileRoute("/")({
  component: Todos,
});

function Todos() {
  const [todos, setTodos] = useState<Array<{ id: string; title: string; completed: boolean }>>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchTodos = async () => {
    setLoading(true);
    const result = await clientRuntime.runPromise(
      Effect.gen(function* () {
        const { client } = yield* ApiClient;
        return yield* client.todos.list();
      }),
    );
    setTodos(result.map((t) => ({ id: t.id, title: t.title, completed: t.completed })));
    setLoading(false);
  };

  const addTodo = async () => {
    if (!title.trim()) return;
    await clientRuntime.runPromise(
      Effect.gen(function* () {
        const { client } = yield* ApiClient;
        yield* client.todos.create({ payload: { title } });
      }),
    );
    setTitle("");
    await fetchTodos();
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    await clientRuntime.runPromise(
      Effect.gen(function* () {
        const { client } = yield* ApiClient;
        yield* client.todos.update({
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
        const { client } = yield* ApiClient;
        yield* client.todos.remove({ path: { id: id as never } });
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
      {loading ? (
        <p>Loading...</p>
      ) : (
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
      )}
    </div>
  );
}
