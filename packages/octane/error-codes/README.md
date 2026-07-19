# Octane production error codes

`codes.json` is the canonical, Octane-owned catalog for framework-created errors
in the core DOM client and server runtimes (`runtime.ts` and
`runtime.server.ts`) that remain observable in production. The numbers are
unrelated to React's error codes.

- Add new codes at `nextCode`, then increment `nextCode`.
- Never reuse or renumber a published code.
- Changing a published message or its argument shape requires a new code.
- Keep retired entries in the catalog with `"status": "retired"` so deployed
  error URLs remain decodable.
- Compiler diagnostics, user-thrown errors, and errors in other runtime surfaces
  do not belong in this initial catalog tranche.

The generator emits surface-specific development lookup modules for the client
and server runtimes. Development builds reconstruct the complete catalog message;
optimized production bundles retain only the compact code, ordered URL arguments,
and a link to `https://octanejs.dev/errors/<code>`. Error construction stays at
the original call site so `Error` subclasses, `TypeError`, `AggregateError`
contents, stacks, and other observable identity are preserved.

The generator currently scans those two core DOM runtime files exhaustively. A
future runtime surface must opt in deliberately, with its own bundle and behavior
coverage, rather than relying on this catalog's guarantees implicitly.

The website imports this committed catalog directly and decodes the same revision
at `/errors/<code>`; it must not fetch a mutable external error map. Consequently,
published numbers and their argument shapes are a compatibility contract even
though Octane does not support versioned React diagnostic catalogs.

Run `pnpm error-codes:generate` after editing the catalog. CI uses
`pnpm error-codes:check` to validate the schema and generated runtime modules,
and compares the catalog with the PR base (or previous main commit) to reject
published-code deletion, renumbering, message/argument drift, and reactivation.
