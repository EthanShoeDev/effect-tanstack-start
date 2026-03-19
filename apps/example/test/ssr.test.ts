import { beforeAll, describe, expect, it } from "@effect/vitest";
import { Command } from "@effect/platform";
import { layer as NodeCommandExecutor } from "@effect/platform-node-shared/NodeCommandExecutor";
import { layer as NodeFileSystem } from "@effect/platform-node-shared/NodeFileSystem";
import { Effect, Layer, Schedule } from "effect";

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const APP_DIR = import.meta.dirname + "/..";

const CommandLive = NodeCommandExecutor.pipe(Layer.provideMerge(NodeFileSystem));

describe("SSR", () => {
  beforeAll(async () => {
    const exitCode = await Command.make("vp", "build").pipe(
      Command.workingDirectory(APP_DIR),
      Command.env({ VITEST: "", NODE_ENV: "production" }),
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.exitCode,
      Effect.provide(CommandLive),
      Effect.runPromise,
    );
    if (exitCode !== 0) throw new Error(`Build failed with exit code ${exitCode}`);
  }, 120_000);

  it.live(
    "HTML contains server-rendered content",
    () =>
      Effect.gen(function* () {
        const server = yield* Command.make("node", ".output/server/index.mjs").pipe(
          Command.workingDirectory(APP_DIR),
          Command.env({ PORT: String(PORT) }),
          Command.stdout("inherit"),
          Command.stderr("inherit"),
          Command.start,
        );

        // Poll until server is ready
        yield* Effect.retry(
          Effect.tryPromise(() =>
            fetch(BASE_URL).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
            }),
          ),
          Schedule.addDelay(Schedule.recurs(30), () => "500 millis"),
        );

        // Seed a todo so we can verify it in SSR HTML
        yield* Effect.tryPromise(() =>
          fetch(`${BASE_URL}/api/todos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Buy milk" }),
          }),
        );

        // Fetch the page and check raw HTML
        const html = yield* Effect.tryPromise(() => fetch(BASE_URL).then((r) => r.text()));

        expect(html).toContain("<h3>Todos</h3>");
        expect(html).toContain("Buy milk");

        yield* server.kill("SIGKILL");
      }).pipe(Effect.scoped, Effect.provide(CommandLive)),
    60_000,
  );
});
