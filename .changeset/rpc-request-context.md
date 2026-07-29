---
'@octanejs/app-core': patch
---

Give `module server` functions access to the request they are serving, via
`getRequestContext()` and `tryGetRequestContext()`.

The RPC boundary built a full `Context` for every request and handed it to the
middleware chain, but the request store it ran the handler inside carried only
`origin` and `platform`. A server function could therefore not read the headers,
cookies, or middleware `state` for its own request, so the identity of the caller
had to arrive as an argument from the browser, which is exactly the value a
mutation must not trust. Render routes already received middleware state through
`RenderRouteProps.state`; server functions now have the equivalent.

```tsx
module server {
  import { getRequestContext } from '@octanejs/app-core';

  export async function deletePost(id: string) {
    const { state } = getRequestContext();
    const user = state.get('user');
    if (!user) throw new Error('Not signed in');
    await db.posts.delete(id, user.id);
  }
}
```

The returned `Context` is the same instance the middleware chain observed,
including its `state` mutations. `context.request.body` is already consumed by
the time a server function runs, since the boundary reads it under the configured
size limit before dispatching, so `bodyUsed` is `true`; headers, cookies, and
`url` are unaffected. `getRequestContext()` throws outside a request because that
is a programmer error, and `tryGetRequestContext()` returns `null` for code that
has to run in both places.

The active async context is published on a `Symbol.for` global, matching the
existing fetch coordinator, so the accessor resolves the live store even though a
server function is loaded through a separate module graph in dev and through the
server manifest in production. Dev and production share the one boundary, so both
behave identically. This does not yet cover SSR render routes, which never enter
the request async context.
