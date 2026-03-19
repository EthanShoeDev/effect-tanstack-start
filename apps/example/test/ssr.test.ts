import { beforeAll, describe, expect, it } from "@effect/vitest";
import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schedule } from "effect";

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const APP_DIR = import.meta.dirname + "/..";

describe("SSR", () => {
  beforeAll(async () => {
    const exitCode = await Command.make("vp", "build").pipe(
      Command.workingDirectory(APP_DIR),
      Command.env({ VITEST: "", NODE_ENV: "production" }),
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.exitCode,
      Effect.provide(NodeContext.layer),
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
      }).pipe(Effect.scoped, Effect.provide(NodeContext.layer)),
    60_000,
  );

  it.live(
    "client bundle does not contain server-only code",
    () =>
      Effect.gen(function* () {
        // Use rg (ripgrep) to search the client bundle for server-only strings.
        // Exit code 0 = match found (bad), exit code 1 = no match (good).
        const clientDir = `${APP_DIR}/.output/public/assets`;
        const exitCode = yield* Command.make(
          "rg",
          "--no-filename",
          "SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET",
          clientDir,
        ).pipe(Command.exitCode);

        expect(exitCode).toBe(1); // 1 = no matches found
      }).pipe(Effect.provide(NodeContext.layer)),
    30_000,
  );
});
