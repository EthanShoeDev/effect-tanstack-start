# SSR API Proxy: Splitting the API to a Separate Service

When the Effect HttpApi implementation grows large, the serverless SSR bundle can become too big, causing slow cold starts. One solution is to move the Effect API to a dedicated service (e.g. k8s) and have the serverless TanStack Start app proxy API requests to it.

## The problem

With the default setup, the serverless function includes:

- React SSR rendering
- The full Effect HttpApi implementation (all handlers, middleware, services)
- The SSR client (direct handler invocation)

As the API grows, this bundle gets heavy. Cold starts suffer.

## The solution

Split into two deployments:

1. **API service** (k8s, long-running) — runs the Effect HttpApi with `toWebHandler`
2. **SSR app** (serverless) — runs TanStack Start, proxies API requests to the API service

## What changes

### Server runtime

The SSR client switches from direct handler invocation to HTTP requests against the API service's internal URL:

```ts
// server-runtime.server.ts — BEFORE (direct call)
import { makeSsrApiClientLayer } from "effect-tanstack-start/server";

const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);
```

```ts
// server-runtime.server.ts — AFTER (HTTP proxy to k8s)
import { makeHttpApiClientLayer } from "effect-tanstack-start/client";

// Points to the API service's internal URL — no CORS, no public internet
const SsrApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient, {
  baseUrl: process.env.API_INTERNAL_URL ?? "http://api-service.internal:3000",
});
```

Note: this uses the same `makeHttpApiClientLayer` as the client runtime, just with a different `baseUrl`. The `ApiClient` tag stays the same — route loaders and components don't change.

### Header forwarding for auth

The SSR HTTP client needs to forward the browser's cookies and auth headers to the API service. Without this, auth middleware on the API service won't see the session cookie.

Use `transformClient` to inject headers from TanStack Start's `getRequestHeaders()`:

```ts
import { makeHttpApiClientLayer } from "effect-tanstack-start/client";
import { HttpClient } from "@effect/platform";
import { getRequestHeaders } from "@tanstack/react-start/server";

const SsrApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient, {
  baseUrl: process.env.API_INTERNAL_URL ?? "http://api-service.internal:3000",
  transformClient: (client) =>
    HttpClient.mapRequest(client, (req) => {
      // Forward browser request headers (cookies, Authorization, etc.)
      // to the API service so auth middleware works during SSR
      try {
        const headers = getRequestHeaders();
        const cookie = headers.get("cookie");
        const authorization = headers.get("authorization");
        if (cookie) req = HttpClientRequest.setHeader(req, "cookie", cookie);
        if (authorization) req = HttpClientRequest.setHeader(req, "authorization", authorization);
      } catch {
        // Outside request context (e.g. during layer init) — skip
      }
      return req;
    }),
});
```

### API splat route

The splat route switches from `mountApi` (which runs Effect handlers locally) to a simple reverse proxy:

```ts
// routes/api.$.ts — BEFORE (local Effect handlers)
import { apiHandler } from "@/runtimes/server-runtime.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: apiHandler,
      POST: apiHandler,
      // ...
    },
  },
});
```

```ts
// routes/api.$.ts — AFTER (proxy to API service)
const API_URL = process.env.API_INTERNAL_URL ?? "http://api-service.internal:3000";

async function proxyHandler({ request }: { request: Request }) {
  const url = new URL(request.url);
  const targetUrl = `${API_URL}${url.pathname}${url.search}`;

  return fetch(targetUrl, {
    method: request.method,
    headers: request.headers, // forwards cookies, auth, content-type, etc.
    body: request.body,
    // @ts-expect-error -- required for streaming request bodies in Node
    duplex: "half",
  });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: proxyHandler,
      POST: proxyHandler,
      PUT: proxyHandler,
      PATCH: proxyHandler,
      DELETE: proxyHandler,
      OPTIONS: proxyHandler,
    },
  },
});
```

The proxy forwards the full `Request` (including `headers` with cookies and auth tokens) to the API service. The browser never talks to the API service directly — no CORS, no OPTIONS preflight.

### What stays the same

- **Client runtime** — still uses `makeHttpApiClientLayer` with `window.location.origin`, no change
- **`ApiClient` tag** — same tag, same typed interface
- **`callApiPromise`** — same function, same usage
- **All route loaders and components** — zero changes
- **`createIsomorphicFn`** — still picks server vs client runtime

## Header flow diagram

```
Browser (has session cookie)
  │
  ├─ SSR (first page load)
  │   └─ callApiPromise → SsrApiClientLive (makeHttpApiClientLayer)
  │       └─ HTTP request to API service (internal network)
  │           headers: { cookie: "session=abc123", ... }  ← forwarded via transformClient
  │           └─ API service auth middleware reads cookie → OK
  │
  ├─ Client navigation
  │   └─ callApiPromise → HttpApiClientLive (makeHttpApiClientLayer)
  │       └─ fetch("/api/todos")  ← same origin, browser sends cookies
  │           └─ Serverless proxy → API service (internal network)
  │               headers: { cookie: "session=abc123", ... }  ← forwarded by proxy
  │               └─ API service auth middleware reads cookie → OK
  │
  └─ Direct API call (e.g. from external client)
      └─ fetch("https://api.example.com/api/todos")
          headers: { authorization: "Bearer ...", ... }
          └─ API service auth middleware reads token → OK
```

## Tradeoffs

|                  | Direct call (default)      | Proxy to service                       |
| ---------------- | -------------------------- | -------------------------------------- |
| **SSR overhead** | Zero serialization         | JSON roundtrip over internal network   |
| **Cold start**   | Heavy (full API in bundle) | Light (just proxy + React SSR)         |
| **Deployment**   | Single serverless function | Two services to manage                 |
| **Shared state** | Same `Ref` instances       | Needs external state (database, Redis) |
| **Latency**      | Zero network               | Sub-millisecond internal network       |

## When to switch

- API bundle exceeds ~5MB and cold starts are noticeable
- You already have k8s/ECS infrastructure for other services
- You need the API to be independently scalable or deployable
- You're using real databases (not in-memory `Ref`) so shared state isn't an issue
