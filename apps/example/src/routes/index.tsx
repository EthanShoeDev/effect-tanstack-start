import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div style={{ padding: 8 }}>
      <h3>effect-tanstack-start example</h3>
      <p>A minimal TanStack Start app for developing the library.</p>
    </div>
  );
}
