import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { Option } from "effect";
import { useState } from "react";
import { callApiPromise } from "@/effect-tanstack";

export const Route = createFileRoute("/")({
  loader: () => callApiPromise((api) => api.todos.list()),
  component: Todos,
});

function Todos() {
  const initialTodos = useLoaderData({ from: "/" });
  const [todos, setTodos] = useState(initialTodos);
  const [title, setTitle] = useState("");

  const fetchTodos = async () => {
    const result = await callApiPromise((api) => api.todos.list());
    setTodos(result);
  };

  const addTodo = async () => {
    if (!title.trim()) return;
    await callApiPromise((api) => api.todos.create({ payload: { title } }));
    setTitle("");
    await fetchTodos();
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    await callApiPromise((api) =>
      api.todos.update({
        path: { id: id },
        payload: { title: Option.none(), completed: Option.some(!completed) },
      }),
    );
    await fetchTodos();
  };

  const deleteTodo = async (id: string) => {
    await callApiPromise((api) => api.todos.remove({ path: { id: id } }));
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
