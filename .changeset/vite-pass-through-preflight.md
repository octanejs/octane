---
'octane': patch
---

Stop parsing modules that the Vite plugin and compiler only pass through.

Nitro, as used by TanStack Start, rebundles the SSR build's own chunks from
`node_modules/.nitro`, and Octane's Vite plugin ran over each one again. Before
checking whether the compiler would read anything from a module, the plugin's
preflight parsed every module in full. The compiler then attributed these
chunks to the application's `package.json` by walking up past `node_modules`.
Code samples inside the chunks' strings matched the hook-import text gate, so
the compiler parsed them a second time to hook-slot them, and the result was
unchanged. The authored parser is slow on large modules with few comments, so
the website's 5 MB docs chunk cost about 90 s and its 1.5 MB benchmarks chunk
about 80 s.

- A file inside a `node_modules` directory that has no manifest of its own,
  such as a `.vite`, `.nitro`, or `.cache` build cache, no longer belongs to
  the application that installed it. Node's package scope lookup draws the
  same boundary.
- Preflight parses a module only when its transform can read a fact that needs
  the AST. Facts that need it are compilation, hook slotting, and a virtual
  barrel's descriptor re-exports. Every other module skips the parse.
- The static requests for a plain JavaScript module's server client-only check
  now come from the module lexer instead of a parse. Module syntax inside
  strings and comments no longer counts as a request.

In a local production build of the website, the Nitro phase drops from 2 m 50 s
to 0.5 s. Every emitted file keeps its content hash.
