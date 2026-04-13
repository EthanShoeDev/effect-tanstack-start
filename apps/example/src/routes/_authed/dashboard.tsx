import { createFileRoute, useLoaderData, useNavigate } from "@tanstack/react-router";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/_authed/dashboard")({
  loader: ({ abortController }) =>
    callApiPromise((api) => api.dashboard.stats(), { signal: abortController.signal }),
  component: Dashboard,
});

function Dashboard() {
  const stats = useLoaderData({ from: "/_authed/dashboard" });
  const navigate = useNavigate();

  const handleLogout = async () => {
    await callApiPromise((api) => api.auth.logout());
    void navigate({ to: "/login" });
  };

  return (
    <div style={{ padding: 8 }}>
      <h3>Dashboard</h3>
      <p>Welcome, {stats.username}!</p>
      <p>
        You have {stats.todoCount} todos, {stats.completedCount} completed.
      </p>
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}
