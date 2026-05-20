import { expect, layer } from "@effect/vitest";
import { Context, Effect, Layer, Schedule } from "effect";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { NodeServices } from "@effect/platform-node";

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const APP_DIR = import.meta.dirname + "/..";

// Note: `ChildProcess.make(...)` is itself an Effect that, when yielded inside a
// scope, spawns the process and returns a `ChildProcessHandle`. We use the
// `ChildProcessSpawner.exitCode` helper for fire-and-forget commands where we
// only care about the exit code, and `yield*` directly for the long-running
// server so we can keep a handle for the finalizer.

const killPort = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* spawner.exitCode(
    ChildProcess.make("sh", ["-c", `lsof -t -i:${PORT} | xargs -r kill -9`], {
      stdout: "ignore",
      stderr: "ignore",
    }),
  );
}).pipe(Effect.ignore);

const build = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("vp", ["build"], {
      cwd: APP_DIR,
      env: { VITEST: "", NODE_ENV: "production" },
      extendEnv: true,
      stdout: "inherit",
      stderr: "inherit",
    }),
  );
  if (exitCode !== 0) return yield* Effect.die(`Build failed with exit code ${exitCode}`);
});

class TestServer extends Context.Service<TestServer, { readonly baseUrl: string }>()(
  "TestServer",
) {}

const TestServerLive = Layer.effect(TestServer)(
  Effect.gen(function* () {
    yield* killPort;
    yield* build;

    // Yielding the Command spawns the process within the current Scope; the
    // process is automatically cleaned up when the scope closes, but we add a
    // SIGKILL finalizer as a belt-and-suspenders since the spawner uses SIGTERM
    // by default and the production server can be slow to shut down.
    const handle = yield* ChildProcess.make("node", [".output/server/index.mjs"], {
      cwd: APP_DIR,
      env: { PORT: String(PORT) },
      extendEnv: true,
      stdout: "inherit",
      stderr: "inherit",
    });

    yield* Effect.addFinalizer(() => handle.kill({ killSignal: "SIGKILL" }).pipe(Effect.ignore));

    const client = yield* HttpClient.HttpClient;

    yield* client
      .get(BASE_URL)
      .pipe(
        Effect.retry(Schedule.addDelay(Schedule.recurs(30), () => Effect.succeed("500 millis"))),
      );

    return { baseUrl: BASE_URL };
  }),
);

const TestLayer = TestServerLive.pipe(
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(TestLayer, { timeout: "120 seconds", excludeTestServices: true })("SSR", (it) => {
  it.effect("HTML contains server-rendered content", () =>
    Effect.gen(function* () {
      const { baseUrl } = yield* TestServer;
      const client = yield* HttpClient.HttpClient;

      const html = yield* client
        .get(baseUrl, { headers: { "Accept-Encoding": "identity" } })
        .pipe(Effect.flatMap((r) => r.text));

      expect(html).toContain("<h3>Todos</h3>");
      expect(html).toContain("Learn Effect");
      expect(html).toContain("Ship it");
    }),
  );

  it.effect("notFound mapping: /todos/nonexistent renders notFoundComponent", () =>
    Effect.gen(function* () {
      const { baseUrl } = yield* TestServer;
      const client = yield* HttpClient.HttpClient;

      const html = yield* client
        .get(`${baseUrl}/todos/nonexistent`, { headers: { "Accept-Encoding": "identity" } })
        .pipe(Effect.flatMap((r) => r.text));

      expect(html).toContain("Todo not found");
    }),
  );

  it.effect("redirect mapping: /dashboard without auth redirects to /login", () =>
    Effect.gen(function* () {
      const { baseUrl } = yield* TestServer;
      const client = yield* HttpClient.HttpClient;

      const response = yield* client.get(`${baseUrl}/dashboard`, {
        headers: { "Accept-Encoding": "identity" },
      });

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
      expect(response.headers.location).toContain("/login");
    }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" })),
  );

  it.effect("client bundle does not contain server-only code", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const clientDir = `${APP_DIR}/.output/public/assets`;
      const exitCode = yield* spawner.exitCode(
        ChildProcess.make(
          "grep",
          ["-r", "SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET", clientDir],
          { stdout: "ignore", stderr: "ignore" },
        ),
      );

      expect(exitCode).toBe(1); // 1 = no matches found
    }),
  );
});
