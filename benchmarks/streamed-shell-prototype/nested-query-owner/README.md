# Nested streamed-query ownership diagnostic

This benchmark-only observation retains a known hydration mismatch. The server
streams `A` for a query owned by the child component. On the observed compiler
and runtime path, hydrating the unchanged component invokes the browser loader,
replaces `A` with its result, and reports a text mismatch. The desired behavior
is to retain the server value without an additional browser load or mismatch.
The diagnostic does not establish the underlying ownership cause, and its
assertions describe the current defect rather than a framework contract.

Run the isolated production-compiled diagnostic from the repository root:

```sh
node node_modules/vitest/vitest.mjs run --config benchmarks/streamed-shell-prototype/nested-query-owner/vitest.config.mjs
```

If the behavior changes, reassess the observation and add a passing framework
regression that asserts the desired server-value and loader contract. This
jsdom diagnostic does not establish behavior for a browser parser or a live
network stream.
