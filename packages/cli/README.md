# @octanejs/cli

The Octane command line. Diagnose a project, wire Octane into an existing one,
install bindings, decode runtime errors, and register the Octane MCP server with
your coding agent.

```bash
pnpm add -D @octanejs/cli
octane doctor
```

Or without installing:

```bash
pnpm dlx @octanejs/cli doctor
```

## Commands

| Command | What it does |
| --- | --- |
| `octane create [dir]` | Create an Octane app in a new directory. This is what `npm create octane` runs. |
| `octane init` | Wire Octane into the project in this directory: bundler plugin, tsconfig, scripts, dependencies. |
| `octane doctor` | Check the project for the mistakes that break Octane quietly. `--fix` repairs the mechanical ones. |
| `octane analyze` | Compile the project and report every Octane compiler diagnostic, with its code and suggested edit. |
| `octane add <package>` | Install a binding, by its own name or by the React package it ports, and print its divergences. |
| `octane bindings [query]` | List and search the `@octanejs/*` bindings. |
| `octane explain <error>` | Decode a runtime error code, including the minified production message, or explain a Strong diagnostic such as `OCTANE_STRONG_RENDER_REF_READ`. |
| `octane info` | Environment and project details worth pasting into a bug report. |
| `octane mcp add` | Register the Octane MCP server with Claude Code, Codex, Cursor, or VS Code. |

Run `octane <command> --help` for the flags. Every command accepts the same
global options: `--json`, `--cwd <dir>`, `--yes`, `--dry-run`, `--no-color`,
`--verbose`.

## `octane doctor`

Octane is a compiler framework, so its misconfigurations tend to fail quietly
rather than loudly. Doctor looks for the ones that do:

- **A second copy of `octane` in the tree.** Hooks and context are keyed per
  runtime instance, so a duplicate breaks them without raising an error.
- **`jsxImportSource` not set to `octane`**, or `@tsrx/typescript-plugin`
  missing from `compilerOptions.plugins`.
- **`tsc` instead of `tsrx-tsc`** in the typecheck script. Plain `tsc` cannot
  read `.tsrx`.
- **`declare module '*.tsrx'`** anywhere in your sources. It silences `.tsrx`
  resolution instead of fixing it, so every import it covers becomes `any`,
  including your own components.
- **No Octane plugin in the bundler config**, or both the compiler plugin and
  the metaframework plugin at once.
- **Routes in `octane.config.ts` pointing at files that do not exist.**
- **`forwardRef` imported from `octane`.** It does not exist; refs are plain
  props.

```bash
octane doctor              # report
octane doctor --fix        # repair the mechanical findings
octane doctor --json       # for CI; exits 3 when an error-severity check fails
```

`--fix` only touches findings whose repair is unambiguous, and it edits files as
text splices, so comments and formatting in your `tsconfig.json` survive.
Anything else is reported with the exact remedy rather than guessed at.

## `octane analyze`

Where `doctor` checks how the project is wired, `analyze` checks the code. It
compiles every `.tsrx`, and every `.tsx` whose JSX goes to Octane, through the
project's own `octane` and reports what the compiler found, so the results are
exactly what a build would warn about, and new compiler diagnostics show up here
without a CLI change. Every Strong violation in a file is reported, not only the
first one the build stops at.

```bash
octane analyze                              # every Octane module in the project
octane analyze src/App.tsrx                 # just these
octane analyze --code OCTANE_HYDRATE_SPLIT_STYLE
octane analyze --strict                     # warnings fail the run too
octane analyze --strong-preview             # what Strong mode would reject, by code
octane analyze --fix                        # apply the compiler's suggested edits
```

```
src/Form.tsrx
  ⚠ 12:43  `onChange` on <input type="text"> is a native commit event in Octane …
      OCTANE_NATIVE_TEXT_ONCHANGE
      suggestion: use `onInput` at 12:43
```

A file that will not parse is reported as an error and does not stop the rest of
the run. Exit code is `3` when anything error-severity was found, or when
`--strict` and there were warnings.

Modules that `compiler.strong` in `octane.config.ts` reaches are analyzed in
Strong mode, as the build compiles them. A `.tsx` module whose leading
`@jsxImportSource` pragma, or the tsconfig's `jsxImportSource`, names another
library is left out unless you name it.

### Migrating to Strong mode

`--strong-preview` compiles every module as if Strong mode were on, reports what
it would reject, and ends with a count per code. Findings in modules that are not
Strong yet do not fail the run, so it works as an inventory before you opt in.

`--fix` applies the edits the compiler suggests and then reports what remains:
React's lazy ref initialization (`if (ref.current === null) ref.current = …`)
becomes `useLazyRef`, `useMemo(() => value, deps)` becomes `value`, and
`useCallback(fn, deps)` becomes `fn`. With `--dry-run` it reports the fixes
without writing them. Under `--json`, each finding with a fix carries its
`edits` as `{ start, end, text }` offsets into the file.

`octane explain <CODE>` prints what a Strong diagnostic detects, its
replacement, and the migration recipes for it. It also accepts a pasted compile
error or its docs link. Every code is documented at
[octanejs.dev/docs/strong-mode](https://octanejs.dev/docs/strong-mode#diagnostic-reference).

### Strong coverage

`octane analyze --strong-baseline init` records every module that compiles
without Strong mode in `octane-strong-baseline.json`. While that file exists,
every run fails on a module that is neither Strong nor listed
(`OCTANE_STRONG_COVERAGE_REGRESSION`), such as one whose `"use strong"` was
deleted, and on a listed name that is now Strong or gone
(`OCTANE_STRONG_COVERAGE_STALE`). `--strong-baseline update` removes stale
names and never adds one, so a new exception is always a reviewed edit to the
file. See
[Keeping modules Strong](https://github.com/octanejs/octane/blob/main/docs/strong-compiler-checks.md#keeping-modules-strong).

## For agents and CI

Every command is fully drivable by flags and emits a single JSON document under
`--json`. Prompts only ever fill in *missing* input, and only in a real
terminal: in a pipe or under `CI`, a missing answer is an error naming the flag
that would have supplied it, never a hang.

Exit codes: `0` success, `1` command failure, `2` usage error, `3` doctor found
error-severity problems.

## `octane mcp add`

Registers `@octanejs/mcp-server` with whichever agents are installed. Where the
client ships its own CLI (`claude`, `codex`) that CLI does the writing, since it
owns its config schema; otherwise the config file is read, merged, backed up,
and rewritten. Run inside an Octane checkout, it also sets `OCTANE_REPO_ROOT` so
the maintainer tools register.

```bash
octane mcp add                      # pick from the agents it finds
octane mcp add claude --scope project
octane mcp status
octane mcp remove cursor
```

## Adding a command

`src/kernel/registry.js` is the command table. An entry carries the name, the
one-line summary, and a lazy `load()`; the module it loads carries the flags,
positionals, and `run`. Nothing is duplicated between them, help text is derived
from the spec rather than written by hand, and only the command actually being
run is ever imported.

```js
// src/kernel/registry.js
{ name: 'lint', summary: 'Lint .tsrx sources.', load: () => import('../commands/lint.js') }
```

```js
// src/commands/lint.js
import { defineCommand } from '../kernel/command.js';

export default defineCommand({
	description: 'Lint .tsrx sources.',
	flags: { strict: { type: 'boolean', description: 'Fail on warnings.' } },
	async run(ctx, input) {
		const project = ctx.project();
		ctx.ui.log(`Linting ${project.tsrxFiles.length} file(s)`);
		return { json: { files: project.tsrxFiles.length } };
	},
});
```

Commands write human output through `ctx.ui` and return their machine payload as
`json`; the kernel prints whichever the caller asked for. Process access goes
through `ctx.exec` so commands that shell out stay testable without spawning.
A command that writes into the project sets `requiresProject: true`, and the
kernel refuses to run it outside a `package.json` rather than letting it fail
somewhere inside an `fs` call.

Doctor checks follow the same pattern: add one to
`src/commands/doctor/checks/<category>.js` with an `id`, a `severity`, a `run`,
and, only when the repair is unambiguous, a `fix`.

## License

MIT
