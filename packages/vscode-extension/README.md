# Octane for VS Code

Standalone Octane framework intelligence, TSRX language support, and MCP-powered
workflows for VS Code.

## Architecture

This extension owns `.tsrx` files directly. It contributes the Octane TSRX
language mode and syntax highlighting, then connects the renderer-neutral TSRX
TypeScript plugin to the editor's native TypeScript server. The plugin first
resolves `octane/compiler/volar` from the current project, then falls back to the
Octane compiler bundled in the VSIX. Completion, hover, navigation, refactors,
and TypeScript diagnostics therefore follow the project's installed Octane
version while still working in loose files. A `tsrx.compiler` entry in the
nearest `tsconfig.json` can explicitly override compiler resolution. No Ripple
extension or Ripple runtime is installed or required.

The Octane flame in the Activity Bar opens a lightweight control surface. It
shows whether Octane IntelliSense owns the active `.tsrx` file and exposes
direct, clickable MCP tools: compile the active Octane file, search official
documentation, inspect binding parity, scan selected React code for migration
compatibility, and open an Octane skill. These actions call the public,
stateless MCP endpoint without authentication and open results in native VS Code
pickers or editors. The panel itself is computed on demand without scanning the
workspace or making network requests.

The official remote MCP endpoint is registered through VS Code's native MCP
provider API:

```text
https://mcp.octanejs.dev/v1/mcp
```

VS Code owns the agent-facing MCP connection lifecycle. Direct panel actions
reuse the same endpoint and run only when clicked, with cancellable progress.
Extension activation performs no network request or workspace scan. Disable the
agent integration with `octane.mcp.enabled`; local TSRX language support and
explicit panel actions are unaffected.

A successful **Compile active file** action extracts the generated JavaScript
from the MCP response and opens it in one reusable, read-only
`Octane Compiled Output.js` editor. Subsequent client or SSR compilations update
that same virtual document, so the extension neither writes temporary files nor
accumulates output tabs. Structured compiler failures still open as JSON so their
location and code frame remain inspectable.

## IntelliSense

Open a `.tsrx` file and check **Octane → TSRX language**. A healthy project
shows `Running`; `Wrong language mode` means the editor has not associated the
file with the `Octane TSRX` language. Completions and navigation also require a
normal TypeScript project with installed dependencies and an Octane-compatible
`tsconfig.json` (`jsx: react-jsx`, `jsxImportSource: octane`). The Octane panel
can restart the TypeScript language service if project dependencies change.

When a `.tsrx` document first opens, the extension restarts tsserver once so a
newly installed language plugin is loaded even if VS Code was already running.
Use **Test IntelliSense** with the cursor on a symbol for a direct health check.
TSRX also supplies JSX closing tags for multiline elements because VS Code's
built-in TypeScript tag closer is restricted to its native TSX language mode.
Disable this behavior with `octane.tsrx.autoClosingTags` if desired.

The bundled Octane agent skills are generated from the canonical files in
`packages/octane-mcp-server/skills`:

```bash
pnpm --dir packages/vscode-extension assets
pnpm --dir packages/vscode-extension assets:check
```

## Development

```bash
pnpm --dir packages/vscode-extension test
pnpm --dir packages/vscode-extension bench
pnpm --dir packages/vscode-extension package
```
