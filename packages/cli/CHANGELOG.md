# @octanejs/cli

## 0.0.1

### Patch Changes

- 574da4d: New package: the `octane` command line.

  ```bash
  pnpm add -D @octanejs/cli

  octane init          # wire Octane into an existing project
  octane doctor --fix  # find and repair what breaks Octane quietly
  octane mcp add       # register the MCP server with Claude Code, Codex, Cursor
  ```

  Octane is a compiler framework, so its misconfigurations mostly fail _quietly_.
  Two copies of `octane` in one tree break hooks and context without raising
  anything, because hook state is keyed per runtime instance. A missing
  `jsxImportSource` degrades rather than errors. A `declare module '*.tsrx'` shim
  silences resolution instead of fixing it, turning every component import into
  `any`, including your own exports. Running plain `tsc` over `.tsrx` mis-handles
  every file. There are also two distinct integration paths,
  `octane/compiler/vite` and `@octanejs/vite-plugin`, and nothing tells you which
  one you actually wired, or that you wired both.

  `octane doctor` is 20 checks over exactly those failure modes, grouped so the
  cause is reported above its symptoms. `--fix` repairs only the ones whose
  remedy is unambiguous, and edits files as text splices, so the comments and
  formatting in your `tsconfig.json` survive. Everything else prints the exact
  change to make rather than guessing at it. Two checks that need an AST to be
  trustworthy, hooks in a plain JS loop and native `onChange` on text inputs, are
  deliberately absent: the compiler already errors on the first, and a doctor that
  cries wolf gets ignored.

  `octane add react-hook-form` resolves the React package to the binding that
  ports it and prints that binding's supported surface and its known divergences
  from `status.json`. When nothing ports it, it says so instead of installing
  something adjacent. `octane explain` takes the whole minified production error,
  `Minified Octane error #3; visit .../errors/3?args[]=...`, and rebuilds the full
  development message with its arguments substituted back in.

  `octane mcp add` prefers each client's own CLI (`claude mcp add`, `codex mcp
add`) because those tools own their config schema, and falls back to a
  read-merge-backup-write when there is no CLI, as for Cursor and VS Code. A
  config file that is missing, empty, or not valid JSON is treated as empty rather
  than crashed on: `~/.cursor/mcp.json` is commonly present and unparseable. Run
  inside an Octane checkout it also sets `OCTANE_REPO_ROOT`, which is what gates
  the MCP server's maintainer tools.

  Every command is fully drivable by flags and emits one JSON document under
  `--json`, so agents and CI use the same code path a human does. Prompts only
  fill in _missing_ input and only in a real terminal; in a pipe or under `CI` a
  missing answer is a usage error naming the flag that would have supplied it,
  never a hang. Exit codes are fixed: `0` success, `1` failure, `2` usage, `3`
  doctor found error-severity problems.

  Adding a command is one entry in `src/kernel/registry.js` plus one module. The
  entry holds the name and summary so `--help` lists everything without importing
  anything; the module holds the flags and `run`, and help text is derived from
  that spec rather than written by hand. The binding and error-code catalogs ship
  as a snapshot generated from this repository by `pnpm cli:data`, checked in CI,
  because the CLI runs against user projects rather than this checkout.
