import { expect, layer } from "@effect/vitest";
import { Command, FetchHttpClient, HttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Context, Effect, Layer, Schedule } from "effect";

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const APP_DIR = import.meta.dirname + "/..";

const killPort = Command.make("sh", "-c", `lsof -t -i:${PORT} | xargs -r kill -9`).pipe(
  Command.exitCode,
  Effect.ignore,
);

const build = Effect.gen(function* () {
  const exitCode = yield* Command.make("vp", "build").pipe(
    Command.workingDirectory(APP_DIR),
    Command.env({ VITEST: "", NODE_ENV: "production" }),
    Command.stdout("inherit"),
    Command.stderr("inherit"),
    Command.exitCode,
  );
  if (exitCode !== 0) return yield* Effect.die(`Build failed with exit code ${exitCode}`);
});

class TestServer extends Context.Tag("TestServer")<TestServer, { readonly baseUrl: string }>() {}

const TestServerLive = Layer.scoped(
  TestServer,
  Effect.gen(function* () {
    yield* killPort;
    yield* build;

    const server = yield* Command.make("node", ".output/server/index.mjs").pipe(
      Command.workingDirectory(APP_DIR),
      Command.env({ PORT: String(PORT) }),
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.start,
    );

    yield* Effect.addFinalizer(() => server.kill("SIGKILL").pipe(Effect.ignore));

    const client = yield* HttpClient.HttpClient;

    yield* client
      .get(BASE_URL)
      .pipe(Effect.retry(Schedule.addDelay(Schedule.recurs(30), () => "500 millis")));

    return { baseUrl: BASE_URL };
  }),
);

const TestLayer = TestServerLive.pipe(
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(NodeContext.layer),
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
      const clientDir = `${APP_DIR}/.output/public/assets`;
      const exitCode = yield* Command.make(
        "grep",
        "-r",
        "SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET_SUPER_SECRET",
        clientDir,
      ).pipe(Command.exitCode);

      expect(exitCode).toBe(1); // 1 = no matches found
    }),
  );
});
