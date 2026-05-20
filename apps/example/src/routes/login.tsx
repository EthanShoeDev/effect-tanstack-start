import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Effect } from "effect";
import { useState } from "react";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    setError("");
    void callApiPromise((api) =>
      api.auth.login({ payload: { username } }).pipe(
        Effect.tap(() => Effect.sync(() => void navigate({ to: "/dashboard" }))),
        Effect.catch((e) => Effect.sync(() => setError(e.message ?? "Login failed"))),
      ),
    );
  };

  return (
    <div style={{ padding: 8 }}>
      <h3>Login</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          placeholder="Username"
        />
        <button onClick={handleLogin}>Login</button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <p style={{ color: "#666" }}>Any username works except &quot;fail&quot;.</p>
    </div>
  );
}
