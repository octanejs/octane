# @octanejs/tanstack-pacer

Octane port of `@tanstack/react-pacer` — debouncing, throttling, rate
limiting, queuing, batching, and their async variants. Re-exports the
framework-agnostic `@tanstack/pacer` core unchanged and implements every
upstream hook family (`useDebouncer`/`useDebouncedState`/`useDebouncedValue`/
`useDebouncedCallback`, throttler, rate-limiter, queuer, batcher, and the
async families) plus `PacerProvider` on Octane hooks, with store
subscriptions via `@octanejs/tanstack-store`.
