import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { DateTime } from "effect";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/todos/$id")({
  loader: ({ params, abortController }) =>
    callApiPromise((api) => api.todos.getById({ path: { id: params.id } }), {
      signal: abortController.signal,
    }),
  notFoundComponent: () => (
    <div style={{ padding: 8 }}>
      <h3>Todo not found</h3>
      <p>The todo you're looking for doesn't exist.</p>
      <Link to="/">Back to todos</Link>
    </div>
  ),
  component: TodoDetail,
});

function TodoDetail() {
  const todo = useLoaderData({ from: "/todos/$id" });

  return (
    <div style={{ padding: 8 }}>
      <Link to="/">&larr; Back to todos</Link>
      <h3>{todo.title}</h3>
      <p>Status: {todo.completed ? "Completed" : "Pending"}</p>
      <p>Created: {DateTime.formatIso(todo.createdAt)}</p>
    </div>
  );
}
