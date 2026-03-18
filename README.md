> Heavily inspired/influenced by:
>
> - [effect-nextjs](https://github.com/mcrovero/effect-nextjs)
> - [voidhashcom/effect-query](https://github.com/voidhashcom/effect-query)

This library is meant to serve as a way to seamlessly integrate Effect-ts with Tanstack start.

In tanstack start, you can define `createServerFn` to define a server-only function.
This function behind the scenes becomes an HTTP endpoint.

Tanstack start provides a helper `useServerFn` to call these from react components but they can reall be called from anywhere.

Tanstack start server functions can be called from:

- route loaders
- components
- imperative clientside code
- ssr or serverside code

Effect-ts provides a way to define HTTP routes with `HttpApi` and `HttpEndpoint`.
It then allows you to derive a typesafe http client to call your `HttpApi`.

A user of both tanstack start and effect-ts could define an `HttpApi` and then mount it on
a tanstack start api splat route. You can use the effect-ts `toWebHandler` to properly mount
the effect-ts HttpApi on the tanstack start api splat route.

It is easy to call this from the client side with the derived http client.
It is not easy to make it so the effect-ts http api endpoints can be called seamlessly from
route loaders or at ssr time without wrapping each endpoint in a `createServerFn` (effectively creating duplicate http endpoints at deployment time).

This library is meant to solve this problem.

The effect-nextjs library provides some helpful guidance on the best way to integrate
effect-ts with an isomorphic web framework. One key insight it offers is that you should define
both a server and client effect-ts ManagedRuntime. This allows you to cleanly seperate server
and client services and provide them where you need.

Also integrating effect-ts with tanstack query is non-trivial. That is the entire reason why voidhashcom/effect-query exists. We need to make sure we integrate nicely with it.

Some future goals of this library:

- Allow the user to define a route loader using an effect-ts generator function.
- Allow the user to define a `createServerFn` using an effect-ts generator function (without wrapping the impl in Effect.runPromise or Runtime.runPromise).
- Distant distant goal: Make a vite plugin that will automatically help code split an effect-ts HttpApi into multiple ssr chunks for each route. This would require tramsmuting effect-ts HttpApi routes into tanstack start api routes and tanstack start middleware.

Relevant links:

- https://www.answeroverflow.com/m/1437468752026533968
- https://www.answeroverflow.com/m/1447246384385364082
- https://www.reddit.com/r/tanstack/comments/1lkzbsj/seamless_integration_of_effect_httpapi_with/

Implementation Notes:

We are going to use viteplus for build, formatting, linting, and testing.
