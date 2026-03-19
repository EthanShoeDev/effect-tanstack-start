import { createFileRoute } from "@tanstack/react-router";
import { HttpApiBuilder, HttpApp, HttpMiddleware, HttpServer } from "@effect/platform";
import { Effect, Layer } from "effect";
import { DomainApi } from "@/api/domain-api";
import { TodosApiLive } from "@/api/todos-api-live";
import { ServerEnvLayer, serverRuntime } from "@/server-runtime";

// HttpApiBuilder.api(DomainApi) provides the Api tag.
// TodosApiLive provides the group implementation.
// ServerEnvLayer provides services from the shared server runtime.
const MyApiLive = HttpApiBuilder.api(DomainApi).pipe(
  Layer.provide(TodosApiLive),
  Layer.provide(ServerEnvLayer),
);

const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);

let handlerPromise: Promise<(request: Request) => Promise<Response>> | undefined;

function getApiHandler() {
  handlerPromise ??= (serverRuntime.runPromise as any)(
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* serverRuntime.runtimeEffect;

        const fullLayer = ApiLayer.pipe(
          Layer.provideMerge(HttpApiBuilder.Router.Live),
          Layer.provideMerge(HttpApiBuilder.Middleware.layer),
        );
        const apiRuntime = yield* Layer.toRuntime(fullLayer);
        const app = yield* Effect.provide(HttpApiBuilder.httpApp, apiRuntime);

        return HttpApp.toWebHandlerRuntime(runtime)(HttpMiddleware.logger(app as HttpApp.Default));
      }),
    ),
  );
  return handlerPromise;
}

const effectHandler = async ({ request }: { request: Request }) => {
  const handler = await getApiHandler();
  return handler!(request);
};

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: effectHandler,
      POST: effectHandler,
      PUT: effectHandler,
      PATCH: effectHandler,
      DELETE: effectHandler,
      OPTIONS: effectHandler,
    },
  },
});
