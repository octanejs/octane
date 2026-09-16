# Conversation integration fixture

`/conversations` is part of the existing Vite dev/production fixture, not a new
workspace application. Its server host is shared with app-core's operation tests.

- `State.tsrx` declares request/document-owned global signals without a scope.
- `Composer.tsrx` binds a writable alias directly to a native textarea and a
  readonly derivation to its character count. A and B have separate draft cells.
- `App.tsrx` requests independent composer activation and reconciles streamed
  conversation turns with stable keys.
- `Calls.tsrx` crosses the real compiler server-function boundary. Middleware
  supplies the test viewer; browser arguments never contain server context.
- `operations.ts` owns accepted jobs independently of subscriptions, deduplicates
  operation IDs, supports explicit Stop, and fences timeout/late output.
- `reconcileReceipt` demonstrates a batch of finite independent receipt/history
  reads. It does not retry a POST or cancel an accepted generation job.

The in-memory host and `x-fixture-viewer` header are deterministic test fixtures,
not production persistence or an authentication implementation.

The production suite includes Chromium and WebKit scenarios which hold the
parent module, type and clear before it loads, activate the composer separately,
then navigate A→B→A while a single accepted operation completes. They assert
derived text, node/focus preservation, separate drafts, and no duplicate turn or
POST. The WebKit production scenario passes with the approved source-built
TSRX toolchain. Workspace dependency pins are unchanged; this is not verification
of the registry tarballs. Chromium remains unrun locally because the managed
Chrome automation policy requires an approved alternative engine.

The separate `/conversation-history` fixture covers later-fetched HTML placement,
cached-input/fresh SSR, URL-action receipt adoption, and finite server-cursor
paging. This initial-stream fixture remains its independent control; neither
scenario establishes complete pressure/latency or native IME evidence.
Document freeze/restore and build/owner mismatch handling pass source-backed
lifecycle tests, but native WebKit navigation did not enter BFCache; account
authorization remains the host's responsibility. See
`docs/async-signals-implementation.md` at repository root. Helper-test success
must not be used as browser or production-build proof.
