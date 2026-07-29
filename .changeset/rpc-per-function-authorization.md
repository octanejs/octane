---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
---

Tell middleware which server function an RPC request targets, so authorization
can be written per function instead of per endpoint.

`options.middlewares` is one chain for the whole RPC boundary, and the only
identifying thing in the request was a compiler-assigned hash in the URL. A
policy could authenticate the caller but could not express "the admin functions
require an admin role" without hard-coding hashes that change on rename.

`Context.rpc` now names the target, and is populated before the middleware chain
runs:

```ts
const authorize: Middleware = async (context, next) => {
  if (context.rpc?.module === '/src/admin.ts' && !isAdmin(context)) {
    return new Response('Forbidden', { status: 403 });
  }
  return next();
};
```

The mapping comes from a new optional `describeFunction(hash)` on
`RpcRequestOptions`, which names an export without loading its module and is
synchronous so the middleware chain never waits on it. The Vite plugin reads the
dev registration map, and the production handler builds descriptors from the
server manifest once per handler, because `build_rpc_lookup` keeps only the
namespace object and export name. An integration that omits `describeFunction`
gets `module` and `export` as `null`, which a per-function policy will not match,
so a hand-rolled boundary must supply it before relying on one.

`rpc.id` is the raw hash and is stable only within a build; authorize on
`module`/`export`. Unauthorized requests already never reached the target
function, since `resolveFunction` runs as the middleware chain's final handler;
this adds the identity that was missing, not a new ordering guarantee.
