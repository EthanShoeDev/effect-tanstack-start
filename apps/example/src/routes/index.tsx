import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { useState } from "react";
import type { Todo } from "@/api/api-contract";
import { callApiPromise } from "@/runtimes/get-runtime";

const SearchParams = Schema.Struct({
  q: Schema.optional(Schema.String),
});
type SearchParams = typeof SearchParams.Type;

export const Route = createFileRoute("/")({
  validateSearch: (input): SearchParams => Schema.decodeUnknownSync(SearchParams)(input),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps, abortController }) =>
    callApiPromise(
      (api) => (deps.q ? api.todos.search({ query: { q: deps.q } }) : api.todos.list()),
      { signal: abortController.signal },
    ),
  component: Todos,
});

function Todos() {
  const todos: ReadonlyArray<Todo> = Route.useLoaderData();
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState(q ?? "");

  const handleSearch = (value: string) => {
    setSearch(value);
    void navigate({ to: "/", search: { q: value || undefined } });
  };

  const addTodo = () => {
    if (!title.trim()) return;
    void callApiPromise((api) =>
      api.todos.create({ payload: { title } }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setTitle("");
            void navigate({ to: "/", search: { q: q || undefined } });
          }),
        ),
      ),
    );
  };

  const toggleTodo = (id: string, completed: boolean) => {
    void callApiPromise((api) =>
      api.todos
        .update({
          params: { id },
          payload: { completed: !completed },
        })
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => void navigate({ to: "/", search: { q: q || undefined } })),
          ),
        ),
    );
  };

  const deleteTodo = (id: string) => {
    void callApiPromise((api) =>
      api.todos
        .remove({ params: { id } })
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => void navigate({ to: "/", search: { q: q || undefined } })),
          ),
        ),
    );
  };

  return (
    <div style={{ padding: 8 }}>
      <h3>Todos</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search todos..."
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="Add a todo..."
        />
        <button onClick={addTodo}>Add</button>
      </div>
      {q && <p>Showing results for &quot;{q}&quot;</p>}
      <ul>
        {todos.map((todo) => (
          <li key={todo.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
            />
            <Link
              to="/todos/$id"
              params={{ id: todo.id }}
              style={{ textDecoration: todo.completed ? "line-through" : "none" }}
            >
              {todo.title}
            </Link>
            <button onClick={() => deleteTodo(todo.id)}>x</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
