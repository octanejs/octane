# Native `onChange` Diagnostics and Event Evidence Plan

> **Status:** proposed implementation plan (2026-07-17). This document makes
> no runtime or compiler change by itself.
>
> **Decision:** keep `onChange` native in Octane. Add an actionable static
> warning for statically known text-entry hosts, add a development-runtime
> fallback for unresolved uncontrolled text controls, and build the
> same-source evidence needed to protect the native contract.

## 1. Decision summary

Octane will not synthesize React's text-input `onChange` behavior and will not
rewrite `onChange` to `onInput`. The public event meanings remain:

- `onInput` / `onInputCapture`: the native `input` event, normally the
  per-edit event for text controls.
- `onChange` / `onChangeCapture`: the native `change` event, normally the
  commit/blur event for text controls and the ordinary committed-value event
  for selects and checkables.

The implementation should add one stable diagnostic,
`OCTANE_NATIVE_TEXT_ONCHANGE`, with two producers:

1. The compiler emits a non-fatal warning when authored JSX proves that a
   standard text-entry host has `onChange` but no `onInput`.
2. The development runtime emits the equivalent warning for an uncontrolled
   text entry only when final props cannot be known statically, notably a
   dynamic input type, a spread, direct `createElement`, or a de-optimized host.

An explicit `suppressNativeChangeWarning` boolean host prop marks deliberate
native commit behavior. It suppresses only this diagnostic, never changes
event delivery, and is never serialized.

Evidence comes before diagnostic rollout. A same-source Octane/React matrix
will record both parity and intentional divergence at intermediate event
boundaries, with real Chromium coverage for activation and cancellation that
jsdom cannot model faithfully. The evidence may uncover native-runtime bugs;
it must not be used to silently grow a React synthetic-event layer.

### Non-goals

- No synthetic event objects, event plugin system, value tracker, or
  `onChange` normalization in core.
- No compiler rewrite from `onChange` to `onInput`.
- No diagnostic on `select`, checkbox/radio, custom elements, component props,
  or library APIs merely named `onChange`.
- No warning for a text host that has both input and change handling.
- No attempt to automate a real operating-system IME session; constructed
  composition/input sequences are deterministic protocol evidence only.
- No compat mode in these waves. Any such proposal is separate and evidence
  gated (section 11).

## 2. Current evidence and constraints

### 2.1 Compiler and runtime ownership today

The implementation should start from these live sources rather than rebuild
event or form-control ownership elsewhere:

| Area | Current owner and evidence | Consequence for this work |
| --- | --- | --- |
| Static host lowering | `packages/octane/src/compiler/compile.js:12082-12659`; event attrs become delegated/capture slots at `12531-12584` | Static classification belongs in a shared authored-AST pass, not in a post-codegen lint. |
| Spreads/final host props | `setHostPropSources` lowering at `compile.js:11577-11592,12635-12659`; runtime `setSpread`/`setHostPropSources` at `runtime.ts:9190-9403` | Any host with a spread is conservatively runtime-owned because source order can change type, handlers, disabled/read-only state, or suppression. |
| Value-position JSX | `rewriteJsxValues` and `jsxElementToCreateElement` at `compile.js:9226-9387` | The static rule must inspect authored JSX before it becomes a descriptor. It cannot be limited to template-output JSX. |
| Direct `createElement` / de-opt hosts | `runtime.ts:11552-11605,12793-13023,13652-13842` | Hand-authored `createElement('input', props)` is runtime-only. The same final-prop validator must cover mount, update, and hydration adoption. |
| Event delegation | `runtime.ts:9660-10141`; discrete events include click, input, change, and composition | Diagnostics must observe event slots without changing dispatch, phase, priority, or flush timing. |
| Controlled restoration | design at `runtime.ts:10420-10527`; restoration at `11055-11264` | Reuse/refactor the existing controlled diagnostic drain, but do not allocate controlled state or composition listeners merely to warn about an uncontrolled element. |
| Current text-entry definition | `isTextEntry` at `runtime.ts:10568-10583` | The warning family is textarea plus input types text, search, url, tel, password, email, and number. |
| Existing warning | `drainControlledSyncs` at `runtime.ts:11098-11150` | It checks bubble and capture slots, but only after a controlled binding and only once for the element. A generalized validator must avoid duplicate static/runtime messages and detect later dynamic regressions. |
| Hydration and portals | de-opt adoption at `runtime.ts:13222-13275,13652-13752`; portal registration/dispatch at `11342-11409,10032-10141` | Host-local validation should naturally work after hydration adoption and inside portals; neither needs a second event model. |

The public `compile()` result currently contains only `code` and `map`
(`compile.js:3666-3690,4639-4642`). The bundler already owns a non-fatal
warning callback (`compiler/bundler.js:289-314`), Vite routes it to its logger
(`compiler/vite.js:146-188`), and the Rspack loader routes it to
`emitWarning` (`packages/rspack-plugin-octane/src/loader.js:88-113`). Volar is
a separate transform (`compiler/volar.js:1-25,91-142`), but its current
`@tsrx/core` `VolarMappingsResult` has only an `errors` channel; there is no
warning-severity transport. The implementation therefore needs structured
compiler diagnostics, adapter plumbing, a shared classifier, and an explicit
editor-consumer integration. A `console.warn` embedded in `compile.js`, or
putting a warning in Volar's `errors` array, would be incomplete and would
misstate severity.

The external owner is identifiable. At Ripple repository commit
`4fe5134732d7a222425cf73a1d31b815384e9202`,
`@tsrx/typescript-plugin` [selects Octane's Volar compiler
entry](https://github.com/Ripple-TS/ripple/blob/4fe5134732d7a222425cf73a1d31b815384e9202/packages/typescript-plugin/src/language.js#L33-L90)
has an [unused diagnostic
placeholder](https://github.com/Ripple-TS/ripple/blob/4fe5134732d7a222425cf73a1d31b815384e9202/packages/typescript-plugin/src/language.js#L211-L225)
but [copies only `transpiled.errors`](https://github.com/Ripple-TS/ripple/blob/4fe5134732d7a222425cf73a1d31b815384e9202/packages/typescript-plugin/src/language.js#L351-L361),
while `@ripple-ts/language-server` [maps only fatal/usage compile errors to
LSP errors](https://github.com/Ripple-TS/ripple/blob/4fe5134732d7a222425cf73a1d31b815384e9202/packages/language-server/src/compileErrorDiagnosticPlugin.js#L1-L107).
The `@ripple-ts/vscode-plugin` [bundles both
packages](https://github.com/Ripple-TS/ripple/blob/4fe5134732d7a222425cf73a1d31b815384e9202/packages/vscode-plugin/package.json#L45-L62).
Therefore the editor work belongs in `Ripple-TS/ripple` packages
`typescript-plugin`, `language-server`, and its VS Code packaging smoke, not in
`@tsrx/core` or Volar itself.

### 2.2 Existing behavioral evidence

The current same-source fixture
`packages/octane/tests/_fixtures/controlled-forms-diff.tsrx` intentionally uses
`onInput` for text/textarea, `onClick` for checkbox/radio, and `onChange` only
for select. Its differential test compares final normalized HTML and adds live
`value`, `checked`, and selection assertions
(`packages/octane/tests/differential/controlled-forms.test.ts:1-159`). That is
good convergence coverage, but it does not characterize the event-name
divergences this proposal is about.

Octane-only conformance already covers accepted/rejected text edits,
programmatic value drift, defaults, spreads, controlled restoration,
composition holding, select input-to-change deferral, capture/bubble delivery,
and hydration. The important gaps are:

- uncontrolled text-host diagnostics;
- final props supplied dynamically or through spreads/de-opt paths;
- same-source intermediate timing rather than final HTML alone;
- browser checkable activation and cancellation;
- controlled checkbox/radio driven only by native `onChange`.

The last item is a concrete risk. `maybeEnqueueRestore` currently restores a
checkable at the end of its native `input` dispatch, while a browser emits
`change` afterward. Unlike select, checkables have no input-to-change deferral.
The existing regression fixture exercises `onInput`, despite its broader
comment. Wave 0 must prove whether a controlled checkbox/radio using only
native `onChange` reads a restored stale value. If confirmed, that is a native
controlled-state correctness bug, not a reason to add React compatibility.

### 2.3 Pinned upstream and platform evidence

The comparison baseline is React v19.2.7, repository commit
`6117d7cca4906492c51fe6a03381e35adfd86e7d`, matching
`packages/octane/audit/react-test-inventory.stable.json`.

Use permanent pinned links in fixture/test comments:

- React [registers synthetic `onChange` dependencies and queues controlled
  restoration](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L37-L68).
- React [uses native change for select/file, click for checkbox/radio, and
  input/change for text entries](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L79-L85),
  [including the checkable/text branches](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L233-L260)
  and [full host routing](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/plugins/ChangeEventPlugin.js#L277-L342).
- React [tracks wrapped value-property writes](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/client/inputValueTracking.js#L54-L130)
  and [emits a synthetic change only for a detected value transition](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/client/inputValueTracking.js#L162-L180).
- React [flushes event updates before controlled restoration](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/ReactDOMUpdateBatching.js#L27-L58)
  through its [controlled restore queue](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/ReactDOMControlledComponent.js#L17-L73).
- A React synthetic event [forwards `preventDefault()` to its backing native
  event](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/SyntheticEvent.js#L72-L102).
- React's event system [extracts simple click handlers before the change
  plugin](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js#L102-L191),
  which anchors the checkable handler-order expectations below.
- Relevant executable upstream cases cover
  [text/textarea and capture](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/events/plugins/__tests__/ChangeEventPlugin-test.js#L86-L168),
  [checkbox and programmatic text writes](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/events/plugins/__tests__/ChangeEventPlugin-test.js#L226-L294),
  [programmatic checked state and radio groups](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/events/plugins/__tests__/ChangeEventPlugin-test.js#L323-L434),
  [input/change deduplication](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/events/plugins/__tests__/ChangeEventPlugin-test.js#L436-L568),
  and [controlled input, checkbox, and textarea behavior](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/events/plugins/__tests__/ChangeEventPlugin-test.js#L608-L746).

Some current Octane comments cite the removed
`ReactControlledComponent-test.js`. New tests must cite the pinned sources
above, and touched stale citations should be repaired rather than propagated.

The browser contract must be tested independently of React. HTML defines
[checkable pre-activation](https://html.spec.whatwg.org/multipage/input.html#the-input-element:legacy-pre-activation-behavior)
before click listeners and [rollback when the click is
canceled](https://html.spec.whatwg.org/multipage/input.html#the-input-element:legacy-canceled-activation-behavior).
Successful [checkbox](https://html.spec.whatwg.org/multipage/input.html#checkbox-state-(type=checkbox))
and [radio](https://html.spec.whatwg.org/multipage/input.html#radio-button-state-(type=radio))
activation emits `input` before `change`; because those events do not opt into
cancelability, DOM's [default `EventInit.cancelable` is
false](https://dom.spec.whatwg.org/#dictdef-eventinit). Thus activation exposes
the prospective checked state during cancelable `click`, then emits
non-cancelable `input` and `change`; canceling the click rolls back activation
and suppresses the later events. An exploratory local probe suggests that
jsdom mishandles canceled radio-group rollback. Wave 0 must turn that
observation into a committed Chromium-versus-jsdom characterization, with the
browser revision recorded, before this plan treats it as evidence; the
acceptance oracle remains the real-browser lane.

For text and composition evidence, use HTML's [common input-event
contract](https://html.spec.whatwg.org/multipage/input.html#common-input-element-events)
and UI Events' [composition session](https://w3c.github.io/uievents/#events-composition-order)
and [composition-input ordering](https://w3c.github.io/uievents/#events-composition-input-events).
Chromium exposes experimental [CDP
`Input.imeSetComposition`](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-imeSetComposition),
which can add a browser-generated composition smoke lane without claiming
portable operating-system IME automation.

## 3. Exact diagnostic contract

### 3.1 Stable code, severity, and message

The code is `OCTANE_NATIVE_TEXT_ONCHANGE`.

- **Build/compiler severity:** `warning`. Compilation succeeds. A host tool may
  enforce warnings-as-errors, but Octane itself does not.
- **Development-runtime severity:** `console.error`, matching the existing
  controlled-form developer diagnostics. It does not throw or alter the event.
- **Production runtime:** no check, marker, queue, allocation, or console call.
  A production build may still report the compile-time warning because it is
  source feedback, not shipped runtime behavior.

Canonical bubble message:

```text
[OCTANE_NATIVE_TEXT_ONCHANGE] `onChange` on <input type="text"> is a native
commit event in Octane; it does not run for each text edit. Use `onInput` for
per-edit updates. If commit/blur behavior is intentional, add
`suppressNativeChangeWarning`.
```

For `onChangeCapture`, the actionable replacement is `onInputCapture`. For a
controlled value, append that edits will be restored before a later native
change and recommend `defaultValue` for editable commit-only behavior. Runtime
messages include source location when compiler metadata exists and otherwise
identify the resolved host/type.

Emit one diagnostic per host, even when both change phases are present. The
primary compiler range underlines the first offending event attribute in
source order, not the whole component; related fix suggestions cover every
offending change attribute (`onChange` -> `onInput`, `onChangeCapture` ->
`onInputCapture`). Structured data must include code, severity, message,
filename, primary start/end offsets and line/column, and the phase-preserving
suggestions. The runtime likewise emits one host diagnostic.

### 3.2 Classification table

| Dimension | Warn | Do not warn | Defer to development runtime |
| --- | --- | --- | --- |
| Host | Lowercase HTML-namespace `textarea`; lowercase HTML-namespace `input` in the text-entry family | `select`, other standard hosts, capitalized/member-expression components, SVG/MathML hosts, hyphenated custom elements | Dynamic string host resolved by `createElement`/host component |
| Input type | Missing/empty type; case-insensitive literal `text`, `search`, `url`, `tel`, `password`, `email`, `number`; an invalid/unknown literal that HTML's invalid-value default normalizes to text | Known literal non-text types, including checkbox, radio, file, range, color, date/time, hidden, button, submit/reset/image | Dynamic or spread-supplied type |
| Event | Direct authored `onChange` and/or `onChangeCapture` whose value is not a literal non-handler | No change handler | Spread-supplied/final event bag |
| Per-edit intent | No `onInput`/`onInputCapture` | Either input phase is statically provable as a callable inline or local binding; both input and change may coexist | Conditional/imported/prop-derived direct input handler, or a spread that can add/remove/override input handling |
| Editability | Editable | Statically true `readOnly` or `disabled` | Dynamic/spread read-only or disabled state |
| Explicit intent | No suppression | `suppressNativeChangeWarning={true}` | Dynamic/spread suppression |
| Control mode | Static warning applies to controlled and uncontrolled authored JSX | — | Runtime's new onChange-specific warning applies to resolved uncontrolled text controls; controlled ambiguous cases remain covered by the unified existing controlled validator |

Additional rules:

- Static event presence is syntax-aware. A literal non-callable value (`null`,
  `undefined`, boolean, number, or string) is absent for this diagnostic and
  does not suppress it; event-handler type/value validation remains separate.
  A direct nonliteral `onChange` is an authored use and can trigger the static
  warning when no input handler is present. An input handler suppresses the
  static warning only when it is an inline arrow/function or resolves to a
  local binding the analyzer can prove is callable. Conditional, imported,
  prop-derived, and otherwise unresolved direct input values make the host a
  runtime-check site. Runtime checks use the actual dispatchable final slot
  (function or compiler event bundle), so non-callable final values do not
  count there.
- Any spread on the host defers the whole decision. Even when a particular
  source order looks provable, a conservative final-props rule prevents drift
  between type, handler, suppression, and removal semantics. This can be
  optimized later only with equivalent tests.
- Bubble and capture are symmetric. Either input phase proves per-edit intent;
  either change phase can trigger the warning. Suggestions preserve the phase.
- Only handlers on the same host count. An ancestor's delegated `onInput`
  cannot be reliably attributed across components or portals; deliberate
  ancestor handling uses the explicit-intent prop.
- `<input is="custom-input">` is still a standard input host and is classified
  from its resolved input type. `<custom-input>` is excluded.
- `contentEditable`, form-level `onChange`, and callback props such as
  `<Field onChange>` are excluded.
- `number` remains in scope because that is the current Octane
  `isTextEntry`/composition family. Expanding to date/range/color or matching
  React's broader synthetic-input classifier is out of scope for this change.
- Invalid literal input types warn statically because the platform's
  invalid-value default is the text state. Keep the compiler's known input-state
  table explicit and test case-insensitive values; do not use a truthy/unknown
  shortcut that could accidentally classify a newly supported type without a
  review.

### 3.3 Explicit native-commit intent

Add the public boolean host prop `suppressNativeChangeWarning` with these exact
semantics:

- `true` suppresses only `OCTANE_NATIVE_TEXT_ONCHANGE` for that host.
- `false`, `null`, `undefined`, or removal does not suppress.
- It never changes event names, listener phase, controlled restoration, or
  scheduling.
- It is a reserved JS-only host hint and is never written to client DOM or SSR
  HTML, including through spreads and de-opt/createElement paths. It is
  consumed rather than serialized on every host, including custom elements;
  custom elements themselves remain excluded from the diagnostic.
- Final spread/source-order semantics apply, and removing a previously true
  value clears the suppression.
- It can silence the onChange-specific branch for either controlled or
  uncontrolled text entries, but documentation should show the valid editable
  commit pattern with `defaultValue`, not a controlled value that reverts every
  edit.

Example:

```ts
function CommitOnBlur() @{
	<input
		defaultValue="draft"
		onChange={(event) => save(event.currentTarget.value)}
		suppressNativeChangeWarning
	/>
}
```

A JS-only prop is preferred to a comment pragma because it survives spreads,
direct `createElement`, de-opt rendering, hydration, and portals. A no-op
`onInput` is not a valid suppression recommendation because it adds observable
event work and misstates intent.

## 4. Compiler/runtime ownership boundary

### 4.1 One static analyzer, all authoring positions

Add a pure authored-AST classifier shared by normal compilation and Volar. Run
it once after parsing the original source and resolving the file's renderer,
but before recursive hydrate-boundary compilation or lowering. Recursive
`compile()` calls must carry an internal prepared/analyzed marker so they
cannot duplicate diagnostics.

The analyzer should:

1. Restrict itself to JSX files/regions owned by the DOM renderer and track
   namespace transitions. An HTML `input` inside SVG `foreignObject` is in
   scope; an intrinsic named `input` owned by a universal/non-DOM renderer is
   not.
2. Resolve the conservative table in section 3.2 without evaluating user code.
3. Produce a structured diagnostic and a small per-host classification:
   `safe`, `statically-warned`, or `runtime-check`.
4. Feed the classification to both template-output lowering and
   value-position JSX-to-`createElement` lowering.

Do not implement the rule independently inside `emitElementHtml`,
`jsxElementToCreateElement`, SSR emission, and Volar. The existing shared
void-element validation pattern demonstrates how authored validation can cover
multiple lowering paths.

Likewise, do not add a diagnostic-only namespace walker. Reuse the compiler's
existing `nsForSelf`/`nsForChildren` rules at `compile.js:1003-1027` (including
the `foreignObject` child reset) and the same resolved renderer configuration
used by lowering/Volar. The classifier may expose a visitor callback over that
walk, but it must not maintain a second HTML/SVG/MathML table.

### 4.2 Diagnostic plumbing

Extend the public compiler result additively:

```ts
interface CompileDiagnostic {
	code: 'OCTANE_NATIVE_TEXT_ONCHANGE';
	severity: 'warning';
	message: string;
	filename: string;
	start: { offset: number; line: number; column: number };
	end: { offset: number; line: number; column: number };
	suggestions: Array<{
		start: { offset: number; line: number; column: number };
		end: { offset: number; line: number; column: number };
		attribute: 'onInput' | 'onInputCapture';
	}>;
}

interface CompileResult {
	code: string;
	map: unknown;
	diagnostics: CompileDiagnostic[];
}

interface VolarCompileResult extends VolarMappingsResult {
	diagnostics: CompileDiagnostic[];
}
```

Required consumers:

- `createOctaneCompiler` formats and forwards warnings through its existing
  configured `warn` callback, deduped by code + canonical filename + source
  range across client/server transforms in one build generation. Clear the
  dedupe set for a watch rebuild so fixing and later reintroducing the source
  can report again.
- Vite uses its logger; Rspack uses `emitWarning`; Rsbuild inherits the Rspack
  path. Add adapter tests so warning loss is not inferred from core tests.
- `octane/compiler/volar` returns the same additive `diagnostics` array while
  preserving `VolarMappingsResult.errors` exclusively for parse/compile
  failures. A golden test owns that local result schema and its source ranges.
- Editor display is a distinct integration dependency: the external
  `@tsrx/typescript-plugin` must retain `transpiled.diagnostics` on
  `TSRXVirtualCode`, and `@ripple-ts/language-server` must translate
  `severity: 'warning'` to LSP `DiagnosticSeverity.Warning` in its compile
  diagnostic service. Returning the field from this repository does not by
  itself prove that an editor shows it. Add a language-server request test for
  an Octane `.tsrx` document and a packaged `@ripple-ts/vscode-plugin` smoke;
  release patch versions of the two public packages and record the minimum
  versions in Octane's editor documentation.
- Direct `compile()` callers can inspect `diagnostics`. Update the website/MCP
  compile tool to return them rather than silently destructuring only `code`.
- `@octanejs/mdx` is a user-facing two-stage compiler, so its public compile
  result and Vite path must propagate warnings and remap ranges through the MDX
  source map back to authored `.mdx` JSX when a mapping exists.
- Incidental internal direct callers may ignore an empty/additive field, but
  user-facing compile surfaces must not. Audit every direct `compile()` call;
  an intentionally discarded diagnostic needs a comment explaining why that
  source cannot contain user-authored hosts.

Because this changes a public compiler result and adds a user-facing warning,
include a patch changeset for `octane`.

### 4.3 Runtime fallback and deduplication

Introduce a development-only host diagnostic record independent of
`ControlledState`. It must not arm controlled restoration, delegate extra
composition events, or make lean uncontrolled `defaultValue` paths allocate
controlled state.

After all final props for a host are installed:

1. Check `namespaceURI`, `localName`, and normalized live `.type`.
2. Read actual bubble/capture event slots using one shared
   `isUsableEventSlot` predicate.
3. Resolve live disabled/read-only state and the final suppression value.
4. Determine control mode from the existing controlled record when present;
   absence is uncontrolled.
5. Queue one commit-phase diagnostic evaluation, before layout effects, so
   source order cannot produce a transient false warning.

Queue from the smallest complete ownership point:

- A dev-only compiler helper after direct dynamic bindings for ambiguous
  literal hosts.
- `setHostPropSources` for aggregate/spread templates.
- The final `applyDeoptProps`/`patchDeoptProps`/`applyHostProps` paths for
  value-position JSX, direct `createElement`, de-opt hosts, and dynamic hosts.

Do not call the diagnostic after each individual spread key. Mount/update and
removal must all reach the same final-state check.

Refactor the existing controlled warning into the same commit validator:

- A statically warned site carries dev-only internal metadata so the browser
  does not repeat the build warning. The marker suppresses only the
  onChange-specific message; a controlled field with no usable handler still
  receives the existing read-only warning.
- An ambiguous controlled site continues to receive the existing
  onChange-without-onInput message, now using the same slot and suppression
  semantics.
- An ambiguous uncontrolled site receives the new runtime warning only when
  it resolves to text entry + usable change + no usable input.
- Select and checkable controlled read-only diagnostics retain their current
  valid event sets.

Track the last offending signature, rather than the current one-shot
`devChecked` boolean. Warn once while a signature remains broken, reset when it
becomes valid, and warn again if a later update re-enters a broken state (for
example checkbox -> text, input handler removal, or suppression removal). A
remount may warn again because it is a new element. This provides useful
dynamic diagnostics without console spam.

### 4.4 Consistency matrix

| Authoring/render path | Static owner | Development-runtime owner | Hydration/portal behavior |
| --- | --- | --- | --- |
| Literal output JSX, complete props | Compiler warning or safe classification | None for this code; internal marker prevents duplicate controlled warning | Same adopted/mounted host; portal location is irrelevant |
| Literal output JSX, dynamic type/read-only/suppression | Compiler marks runtime-check | Dev helper queues after all direct bindings | Runs after adoption and final client props |
| Literal output JSX with any spread | Compiler declines final judgment | `setHostPropSources` final-prop check | Same source resolution during hydration and in portals |
| Value-position JSX | Same authored-AST classifier | Descriptor/de-opt final-prop path when unresolved | Existing descriptor hydration adoption path |
| Direct `createElement('input', props)` | None | `applyHostProps`/de-opt final-prop path | Same runtime path; location is optional |
| Dynamic host string | None | Check only if resolved live host is HTML input/textarea | Same runtime path |
| SSR-only output | Compiler still returns source warning | None; events/hints do not serialize | `suppressNativeChangeWarning` is dropped from HTML |
| Custom element/component | Excluded | Excluded | No change |

Acceptance requires identical warning decisions for a logically identical
final host regardless of template, descriptor, hydrate, or portal placement.
The only permitted difference is source-location richness for hand-authored
runtime `createElement` calls.

## 5. Same-source differential evidence design

### 5.1 Harness shape

Add:

- `packages/octane/tests/_fixtures/native-change-matrix.tsrx`
- `packages/octane/tests/differential/native-change-matrix.test.ts`
- a dedicated real-browser fixture/entry under
  `packages/octane/tests/browser/native-change/`
- an `octane-events-browser` Vitest project running in Node and launching
  Playwright Chromium.

Add `playwright` as a catalog dev dependency of the `octane` workspace package,
wire the new project into the root Vitest project list and CI Chromium install,
and fail with the installation command when the browser binary is absent. The
browser suite must run under `pnpm test`; it is not an optional local script.

Compile the same `.tsrx` fixture once with Octane and once with the existing
`@tsrx/react` precompiler. Refactor/reuse the cache compiler in
`packages/octane/tests/differential/_setup.ts`; do not add another ad hoc source
rewriter.

Do not place the Octane-only `suppressNativeChangeWarning` prop directly on a
host in the React side of the same-source fixture: React does not own that prop,
and its unknown-prop handling would contaminate the comparison. For a matrix
row that deliberately has only text `onChange`, capture/assert the expected
Octane compiler diagnostic as part of fixture compilation, then prove
suppression and unchanged behavior in a companion Octane-only test. The fixture
loader should expose a warning collector (code + source range + export/case),
assert an exact allowlist, and prevent those expected build warnings from
falling through to the process logger. Both jsdom and browser harnesses must
fail on every unrelated Octane/React console warning or page error. Do not add
a file-wide warning ignore or a test-only source rewrite that silently removes
the prop from React output.

Keep the current differential `step()` equality contract strict. Add an
additive `observe()`/`expectPerRuntime()` API that:

- drives both runtimes under Octane `flushSync` and React `act`;
- records explicit per-runtime expectations for intentional divergences;
- still requires normalized HTML equality for convergence rows;
- exposes only public observations: callback records, text output, live
  `value`/`checked`/`selectedIndex`, event type/phase flags, cancelability, and
  `defaultPrevented`;
- never reads React `_valueTracker`, Octane `$$*` fields, restore queues, or
  generated helper names.

Pass a recorder callback into the same-source fixture so logging does not
itself schedule component state and perturb restoration. Each immutable record
should include handler label, `event.type`, value/checked snapshot,
`event.cancelable`, `event.defaultPrevented`, and the relevant radio cousin
states. Snapshot after each event boundary, not only after the complete user
action.

Use native prototype setters when the test intends an untracked user-like
value transition, and ordinary property setters when it intends a programmatic
tracked write. Say which one is used in the test name and comment.

Keep deterministic dispatch and trusted browser behavior distinct. In jsdom,
setting `.value`, dispatching `input`, and calling `blur()` does not require the
platform to synthesize a later `change`; deterministic rows must explicitly
dispatch `new Event('change', { bubbles: true })`. A separate Chromium row uses
trusted keyboard input followed by Tab/focus transfer and asserts the browser's
real commit event. Never use synthetic blur as evidence that change was
generated.

### 5.2 Text, textarea, select, and programmatic writes

| ID | Same-source case and sequence | Public assertions | Expected relation |
| --- | --- | --- | --- |
| T1 | Deterministic: native setter -> explicit `input` -> checkpoint -> explicit `change`; browser: trusted typing -> Tab/focus transfer | Ordered input/change capture+bubble callbacks and live value | React synthetic `onChange` occurs at input; Octane native `onChange` occurs at change. Final value/count may converge, intermediate timing must differ explicitly. |
| T2 | Controlled text with only `onChange`: deterministic setter + explicit input/change checkpoints; trusted browser typing + Tab | State output and live value after input and commit | React accepts during input; Octane restores before a later change. This is the diagnostic's primary migration failure. |
| T3 | Controlled text with `onInput`, accepting and rejecting variants | State and live value after each input | Convergence control; preserve existing accepted/rejected semantics. |
| T4 | Uncontrolled commit-only text with `defaultValue` and `onChange`: deterministic explicit input/change plus trusted browser typing -> Tab | No callback before explicit/trusted commit; one native change at commit; expected Octane compile diagnostic is captured, not printed | Valid native behavior; React timing is recorded as an intentional difference. A companion Octane-only case adds suppression and proves zero diagnostic with identical event behavior. |
| A1 | Repeat T1/T2/T3 for `textarea` | Callback timing, state, and live textarea value | Same timing split as text input; final controlled `onInput` cases converge. |
| S1 | Controlled select: assign selected value -> native `input` -> native `change` | Capture and bubble both see new value; live value/index after each boundary | Convergence. It protects current select input-to-change restore deferral and proves select is a diagnostic negative. |
| P1 | Text and textarea `el.value = x`, no event | No callback; live value is `x` until a later controlled commit | Convergence. |
| P2 | Wrapped property write -> native `input` | `onChange` callback count, live value | React's value tracker suppresses synthetic change; Octane native change is not an input listener. Both `onChange` counts are zero. |
| P3 | Native prototype setter -> `input` checkpoint -> `change` checkpoint | Callback timing/count and value | React fires synthetic change at input and deduplicates later change; Octane fires only at native change. |
| P4 | Wrapped property write -> explicit native `change` | Callback count and event type | React tracker suppresses text synthetic change; Octane receives the explicitly dispatched native change. Intentional divergence. |
| P5 | Programmatic select assignment -> native `change` | Callback and selected value/index | Convergence because React's select branch uses native change. |

T1 and A1 must include capture variants. A same-host `onInputCapture` suppresses
the diagnostic even when `onChange` is bubble (and vice versa); phase-specific
handler order remains separately asserted.

### 5.3 Checkboxes, radios, ordering, and cancellation

These rows use trusted Playwright clicks in Chromium. jsdom coverage may remain
as a fast smoke test, but it is not the acceptance oracle for activation
rollback.

| ID | Same-source case and sequence | Public assertions | Expected relation |
| --- | --- | --- | --- |
| C1 | Uncontrolled checkbox, trusted click | Order and checked snapshot for click/input/change; cancelability | Final checked state converges. React synthetic `onChange` runs from click before native input; Octane native `onChange` follows input. |
| C2 | Controlled checkbox accepting `onInput`, click twice | Handler sees fresh checked state; rendered state and live checked | Convergence control; preserves current regression coverage. |
| C3 | Controlled checkbox accepting only `onChange`, click twice | Value seen by handler, state output, final checked | Desired native Octane contract is a successful toggle. Expected to expose the current input-before-change restoration risk; land the test only with any needed correctness fix. |
| C4 | Controlled checkbox rejecting the activation | Checked snapshots during click/input/change and after settle | Final rendered state converges; intermediate restoration timing may differ and must be explicit. |
| C5 | Programmatically assign checkbox/radio `.checked`, first with no event and then with an explicit native `change` | Callback count and live checkbox/group state | Assignment alone emits nothing in either runtime. An explicit change reaches Octane's native handler, while React's checkable synthetic change is click-derived; record the divergence. |
| R1 | Accepting controlled radio group, initially A: `onChange` sets state from the event; trusted click B, settle, then A | Initial A=true/B=false; click, input, change, handler, and settled cousin snapshots for each activation | Each activation ends on the clicked radio. React accepts during click-derived synthetic change; Octane must let native change observe A=false/B=true (then the symmetric A click) before restoration. |
| R2 | Rejecting controlled radio group, initially A: `onChange` records but never updates; trusted click B | Click pre-activation snapshot A=false/B=true; exact input/change/handler cousin snapshots; settled A=true/B=false | Expected timing split to confirm in Wave 0: React restores A before later native input/change observations; native Octane must expose B to its change handler, then restore A after change. A stale A snapshot inside Octane's change handler is the C3 restoration defect, not an accepted result. |
| R3 | Initially A; click the already-selected A | Event counts and both cousins at click and settle | Browser emits click only, A=true/B=false throughout, with no input/change; React's tracker must not synthesize a duplicate change. |
| D1 | Checkbox and radio `onClick` calls `preventDefault()` | Click is cancelable; input/change counts are zero; checkbox/group rolls back | Native activation rolls back in both. React synthetic `onChange` was extracted from click; Octane native change never runs. |
| D2 | Checkbox and radio `onChange` calls `preventDefault()` | Event type, cancelability/defaultPrevented before/after, final checked/group | Intentional semantic divergence: React forwards preventDefault to the cancelable backing click and rolls back; Octane's later native change is non-cancelable and activation remains. |
| D3 | Prevent default in native `onInput` or a raw native `change` observer | Non-cancelable flags and final checked/group | Cancellation has no effect; protects platform-native behavior from restore changes. |

The C3/R1/R2 evidence is a stop/go point. If current restoration hides the fresh
state from native change, adjust restoration ownership so the input dispatch
cannot erase state before the immediately following change. Preserve C2,
rejected restoration, canceled click, radio cousins, and select deferral. Do
not commit a skipped/todo/expected-failure C3 test and do not pin the broken
outcome as a contract.

Mount each framework's radio group in a separate form and use distinct names so
the browser never treats the Octane and React fixtures as one group. Use raw
native observation hooks only for checkpoints; R1's state update is exclusively
in `onChange`, and R2 has no state update in any event observer.

### 5.4 Composition/IME protocol

Use constructed `CompositionEvent` and `InputEvent` sequences with
`isComposing` where supported for deterministic cross-runtime evidence:

`compositionstart -> composition input -> compositionupdate -> compositionend
-> terminal input`.

| ID | Case | Checkpoints and expectation |
| --- | --- | --- |
| I1 | Controlled accepting `onInput` | Live value and state at every boundary; final convergence. |
| I2 | Controlled `onChange` only | React accepts the input-derived synthetic change; Octane does not run native change and restores after composition end. Diagnostic-critical intentional divergence. |
| I3 | Controlled rejected edit | Record mid-composition and post-composition value. Wave 0 tests the audit hypothesis that React restores during the composing input while Octane holds restoration until composition end. Require final convergence and make any confirmed timing split explicit. |
| I4 | Uncontrolled commit-only text | Composition edits remain live. The deterministic row explicitly dispatches change after the session; the Chromium row commits by trusted focus transfer. Native change fires once at commit, not for every composition input. |

Run deterministic protocol cases in the differential suite. Add a Chromium
smoke using CDP `Input.imeSetComposition` plus `Input.insertText`, pinning the
browser version and asserting candidate preservation/restoration rather than
every incidental raw field or `isTrusted`. React 19.2.7 has [no composition
guard in controlled input
restoration](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom-bindings/src/client/ReactDOMInput.js#L89-L190),
whereas Octane's current restoration code deliberately holds the candidate.
That code comparison motivates I3 but is not sufficient behavioral evidence.
If Wave 0 confirms the timing split, touched comments that call the hold React
parity must be corrected to an `OCTANE DIVERGENCE` safety rationale. Do not
label this “real IME coverage”; CDP does not drive a portable operating-system
IME session.

### 5.5 Diagnostic, hydration, and portal tests

Add focused compiler tests for the published diagnostic artifact, not emitted
helper formatting:

- warning code/severity/range/suggestion for input (all seven text-entry types,
  omitted/empty/invalid literal type, case-insensitive values) and textarea,
  bubble and capture;
- no warning for known non-text types, select, custom elements, component
  callbacks, SVG/MathML, read-only/disabled, both input+change, or explicit
  suppression; specifically include an intrinsic named `<input>` in a
  universal/non-DOM renderer as a negative and an HTML `<input>` below SVG
  `<foreignObject>` as a positive namespace-transition case;
- runtime classification for dynamic type and every spread case;
- identical authored result in client/server modes, output JSX, early-return or
  array/value-position JSX, and hydrate-boundary preparation, with no duplicate
  diagnostics;
- direct compiler result, bundler/Vite, Rspack/Rsbuild, the additive Volar
  result, and the external editor-consumer delivery test.

Add development-runtime public-observation tests for:

- uncontrolled spread-provided `onChange`, dynamic non-text -> text type, and
  handler/suppression removal;
- direct conditional `onInput={enabled ? handle : undefined}` and
  prop/import-derived input handlers transitioning callable -> absent ->
  callable, with the warning appearing only in the absent episode;
- direct `createElement('input', props)`, value-position/de-opt JSX, and dynamic
  string hosts;
- spread/de-opt and direct `createElement` hosts beneath SVG and
  `foreignObject`: an SVG-namespace element whose local name is `input` stays
  quiet, while the corresponding HTML-namespace input below `foreignObject`
  warns; a non-DOM renderer never enters the DOM validator;
- bubble/capture presence, actual nullish slots, and both phases of `onInput`;
- literal and spread suppression, including true -> false/removal;
- read-only/disabled, select, checkables, custom elements, and components as
  negative controls;
- once per continuing offending signature, reset after a valid state, and warn
  again on a later broken transition;
- one compiler warning with no duplicate runtime error at statically handled
  controlled and uncontrolled sites;
- zero runtime warning and unchanged native behavior in the `octane-prod`
  project.

Before treating production-size ratios as the stripping oracle, add a focused
`native-change-diagnostic-ambiguous.tsrx` fixture containing a dynamic text
type, an event spread, and a direct `createElement` host. Add it to the fixed
corpus in `benchmarks/codegen-size/run.mjs`, and add a minimal mounted
Octane-only `diagnostic_` target to `benchmarks/bundle-size/run.mjs`. Record new
baselines/ratios. This guarantees that the production paths under measurement
would need the fallback in development; do not infer stripping from a corpus
that never exercises the feature or from private generated-helper names.

Hydration cases must cover matching adoption, mismatch replacement, and a
pre-hydration user value. Assert node identity where adoption is expected,
live value, event behavior, diagnostic count, and no unrelated hydration
mismatch. Portal cases assert the same diagnostic and native event behavior in
the foreign target. Never assert hydration marker shape or private event/control
expandos.

## 6. Documentation, bindings, tools, and training

### 6.1 Canonical and generated guidance

Update the canonical contract in:

- `README.md`;
- `docs/differences-from-react.md`;
- `docs/react-parity-migration-plan.md`;
- `docs/react-library-compat-plan.md`;
- `docs/react-hosted-octane-compat-plan.md`;
- website `differences-from-react.mdx`, `core-apis.mdx`, and
  `tsrx-vs-tsx.mdx`;
- `website/public/llms.txt`.

Each should distinguish per-edit `onInput`, intentional text commit
`onChange`, legitimate select/checkable native change, and component/library
callback names. Show the suppression prop only for deliberate text commit
behavior.

RuleSync is the source of truth for shared agent guidance. Edit only
`.rulesync/rules/project.md` (native event and controlled-form sections), then
run `pnpm rules:generate` and `pnpm rules:check`. Do not hand-edit generated
`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`, or `.cursor/rules/project.mdc`.

Separately update the non-RuleSync agent/MCP sources:

- `.ai/project-map.md`;
- `.ai/skills/react-library-port.md` and `.ai/skills/bug-hunter.md` (their
  controlled-input wording is stale);
- `packages/octane-mcp-server/src/bridge.js` and its README;
- `packages/octane-mcp-server/skills/migrate-react-component.md`,
  `bridge-react-package.md`, and `react-divergences.md`;
- `website-mcp/src/mcp/compile-tool.ts`, its ambient compiler declaration,
  tool schema/description, and tests so a successful compile returns a
  `warnings` array rather than dropping it;
- `website/src/lib/playground.ts` and
  `website/src/pages/playground/Playground.tsrx` so `CompileSuccess` carries
  warnings and the playground renders a non-blocking warning list with code,
  message, and authored range while still updating/running compiled output.

The bridge must not blanket-rewrite every `onChange`: it should target standard
text hosts, preserve select/checkable/native commit cases, and ignore component
callbacks.

Playground/MCP tests must distinguish fatal `error` from non-fatal `warnings`:
an offending text host returns runnable code plus exactly one warning; a
suppressed native-commit sample returns runnable code and an empty array; an
invalid component still returns the existing fatal shape.

### 6.2 Testing Library

Preserve `@octanejs/testing-library`'s deliberate use of unwrapped
`@testing-library/dom` `fireEvent`. Update its README, `src/fire-event.ts`,
status, migration plan, and tests to make these user-level distinctions:

- `user.type(text)` produces native input events; a text `onChange` callback
  does not run until `user.tab()`/blur commits.
- `onInput` observes typing per edit.
- `fireEvent.change` is an explicit native change dispatch, useful for text
  commit and select tests; it is not a text-typing simulation. On a checkable
  it also does not reproduce click activation, automatic toggling, rollback,
  or click -> input -> change ordering.
- `user.click(checkbox)` follows browser click -> input -> change ordering.
- Accidental text-host `onChange` warns unless explicitly marked as commit
  behavior.

Do not add a React-style `fireEvent.change` -> input remap; that would contradict
both core and the package's current contract.

### 6.3 Binding audit

Run the new compiler/runtime diagnostic across every binding, but change only
DOM host wiring. Public APIs/options named `onChange` remain unchanged.

Make this audit a binding-tagged subset of a repository-wide gate rather than
a one-time grep. Add `pnpm native-events:diagnostics` and
`pnpm native-events:diagnostics:check`, sourced from the shared classifier's
non-public audit mode. Generate
`packages/octane/audit/native-event-diagnostic-sites.json` with every
first-party candidate's package, authored file/range, classification
(`warning`, `suppressed-intent`, or `runtime-check`), and reviewed
disposition. Cover production packages, first-party examples and fixtures,
website/playground source, website MDX snippets, MCP skill examples, and eval
starters/references; exclude generated output and clearly label vendored
upstream React fixtures. The check fails on an unclassified addition, removal,
or moved range.

For bindings, add a dynamic lane that mounts representative
host-factory/render-prop/spread cases in development and fails on unexpected
runtime diagnostics. Package-specific lanes do the same for playground/eval
consumers that assemble host props at runtime. Source-text search remains
useful for comments, but cannot be the acceptance oracle for spreads, direct
`createElement`, aliases, generated props, or snippets compiled through MDX.

Priority review:

- **Base UI:** dynamic prop bags in `src/field.ts` and visible text input in
  `src/number-field.ts` appear to use React-style `onChange`; migrate per-edit
  wiring to `onInput`. Decide whether the hidden controlled number input is a
  real commit case; if yes, use the explicit-intent prop and add behavioral
  evidence. Preserve legitimate checkbox/radio/switch/slider changes.
- **Hook Form:** keep public validation option keys named `onChange` and DOM
  register output named `onInput`; fix the stale React-style input JSDoc in
  `src/types/form.ts`.
- **Aria, TanStack Form, and TanStack AI:** retain public value callbacks named
  `onChange`; clarify that text DOM wiring uses `onInput`.
- **Radix:** preserve OneTimePasswordField's input adaptation and legitimate
  hidden/form change events; update stale uncontrolled wording/status.
- **Remix Router:** fix or explicitly mark the vendored text-input `onChange`
  JSDoc example.
- **MDX:** propagate/remap compiler warnings from authored JSX and add one MDX
  compile/Vite test; no MDX-specific event semantics or rewrite is needed.

For each affected binding, add a focused typing/commit test rather than relying
on source search. Update its `status.json` when the documented surface or known
divergence changes. Regenerate `docs/bindings-status.md` with
`pnpm bindings:status`; never edit the generated table directly.

### 6.4 React parity ledger

`docs/react-parity-coverage.md` is generated from
`packages/octane/audit/react-conformance-ledger.json`. Most
`ChangeEventPlugin` cases correctly remain documented non-goals because they
assert synthetic extraction or value-tracker deduplication. The evidence wave
should update case-level rationale/evidence only when a new test proves a
portable public outcome; it must not relabel synthetic mechanics as Octane
parity. Regenerate/check with:

```bash
pnpm react-parity:generate
pnpm react-parity:check
```

### 6.5 Evals and training prompts

Keep `octane.native-controlled-search` focused on the controlled `onInput`
contract. Add a separate focused user-app task for native change intent that
requires:

- per-edit text behavior with `onInput`;
- one uncontrolled/defaulted text field that deliberately saves on blur with
  `onChange` plus `suppressNativeChangeWarning`;
- a select and checkbox using legitimate `onChange`;
- a component callback named `onChange` that is not rewritten;
- a dynamic/spread text prop bag that resolves to valid `onInput` wiring and
  produces no development diagnostic.

The reference app and grader should assert observable edit-vs-commit timing
and zero unexpected diagnostics. Source-contract tests may narrowly assert the
required event names and explicit-intent prop, but the behavioral grader is
primary. Add prompt guidance explaining capture and host-vs-component scope.

After catalog/prompt/reference changes, regenerate and check the committed
corpus:

```bash
pnpm --filter @octanejs/evals corpus:generate
pnpm --filter @octanejs/evals corpus:check
pnpm --filter @octanejs/evals test
```

## 7. Reviewable implementation waves

### Wave 0 — evidence harness and baseline characterization

**Scope**

- Add strict per-runtime observation support without weakening current
  differential equality.
- Add text, textarea, select, programmatic-write, and constructed-composition
  rows.
- Add the Playwright Chromium checkable/radio activation and cancellation
  harness using the same fixture.
- Replace new/touched stale React citations with pinned v19.2.7 permalinks.
- Run C3/R1/R2 as a local stop/go probe; do not commit a skipped or knowingly
  wrong desired-contract test.

**Dependencies:** none.

**Acceptance**

- Every matrix row has an explicit public expectation for both runtimes.
- Intentional differences are ordinary passing tests with an
  `OCTANE DIVERGENCE` rationale.
- Browser-only cancellation/group rollback is asserted only in Chromium.
- The evidence report records the pinned React commit, Playwright and Chromium
  revisions, exact public event logs used as assertions, and which rows are
  deterministic protocol simulations versus trusted browser actions.
- The exploratory radio-rollback and composition-restoration hypotheses are
  either confirmed by committed tests or removed/reworded; local probe output
  is not cited as durable evidence.
- No runtime/compiler behavior changes are hidden inside the harness PR.

### Wave 1 — diagnostic contract and compiler/editor plumbing

**Scope**

- Add the shared classifier, structured compile result, stable code/ranges,
  suppression syntax, build-adapter forwarding, and additive Volar diagnostic
  result.
- Coordinate the external `Ripple-TS/ripple` changes: teach
  `@tsrx/typescript-plugin` to retain the additive array,
  `@ripple-ts/language-server` to map it to LSP warning severity, and
  `@ripple-ts/vscode-plugin` to pass a packaged-extension smoke. Release patch
  versions and add the minimum supported versions to Octane's editor docs.
- Carry static safe/warn/runtime-check classification through output JSX and
  value-position lowering with hydrate-recursion dedupe.
- Add public host typing and client/SSR reserved-prop filtering for
  `suppressNativeChangeWarning`.
- Add the `octane` patch changeset.

**Dependencies:** Wave 0 pins the intended host/event vocabulary.

**Acceptance**

- Section 3.2's complete static matrix passes in client and server compile
  modes and in the local Volar result, including the non-DOM renderer negative
  and SVG `foreignObject` HTML positive.
- Vite, Rspack/Rsbuild, and direct compiler consumers receive one warning with
  a stable source range; a dual client/server build does not duplicate it.
- The integrated editor consumer displays one warning at the same authored
  range and does not add it to the fatal `errors` channel. If the external
  consumer release is not available, Wave 1 can be split into local schema and
  consumer-integration PRs, but the diagnostic rollout and definition of done
  remain blocked on the latter.
- No event is rewritten and suppression does not serialize.

### Wave 2 — development-runtime fallback and controlled-warning unification

**Scope**

- Add the allocation-light uncontrolled diagnostic record and final-prop
  scheduling at aggregate/de-opt/createElement paths.
- Refactor current controlled warning checks to the shared usable-slot,
  suppression, dedupe, and dynamic-transition semantics.
- Add static-handled metadata to prevent compiler/runtime duplicates.
- Cover hydration, portals, spreads, dynamic types, removal, and production
  stripping.
- Add the ambiguous-host fixture to both production-size harnesses and ratchet
  their baselines before claiming zero shipped diagnostic cost.

**Dependencies:** Wave 1 defines the public code, suppression prop, classifier
metadata, and structured messages.

**Acceptance**

- Every row in sections 4.4 and 5.5 passes.
- An uncontrolled text host reached through each ambiguous path warns once per
  offending transition; all exclusions remain quiet.
- Controlled no-handler warnings still work; static onChange sites do not
  double-report.
- The `octane-prod` project is semantically silent, and the deterministic
  codegen-size/bundle-size ratio gates show no production regression.

### Wave 3 — native controlled-checkable correctness, if Wave 0 confirms it

**Scope**

- Ensure a controlled checkbox/radio using native `onChange` can observe and
  accept the fresh activation before restoration.
- Land C3/R1 accepting and R2 rejecting desired-contract tests with the fix,
  never as an expected failure.
- Preserve accepting/rejecting `onInput`, click cancellation, radio cousins,
  select deferral, and event cancelability/order.
- Add a separate patch changeset entry if the fix is independently reviewable.

**Dependencies:** Wave 0 browser evidence. It can be reviewed in parallel with
Wave 2 but must precede docs claiming native controlled onChange works.

**Acceptance**

- The complete checkable matrix passes in Chromium and fast jsdom tests where
  platform behavior is representable.
- The change affects controlled restoration only; event meanings and handler
  order remain native.

### Wave 4 — ecosystem migration and guidance

**Scope**

- Update canonical docs, RuleSync source/generated artifacts, website/LLM/MCP
  guidance, compile-tool diagnostics, Testing Library, binding host wiring and
  statuses, React ledger evidence, and the focused eval task.
- Add the reproducible repository-wide
  `native-events:diagnostics[:check]` inventory described in section 6.3,
  including binding-tagged results, website/playground, MCP skills, and eval
  sources. Exclude generated output and separately label vendored upstream
  React fixtures.
- Add targeted development-runtime audit fixtures for binding paths that build
  host props dynamically (`createElement`, host factories, render-prop bags,
  and spreads), because a static compile inventory cannot prove those paths.
- Add changesets for user-facing binding changes where required.

**Dependencies:** Waves 1-2; Wave 3 if confirmed.

**Acceptance**

- `pnpm native-events:diagnostics:check` reports no new or unclassified static
  or dynamic site across any first-party compile consumer. Every recorded
  warning is migrated or has a tested, explicit native-commit disposition;
  source search is only a supplemental review aid.
- Binding APIs named `onChange` are unchanged unless they are literal DOM host
  props.
- Testing Library teaches real input/change sequences without remapping them.
- RuleSync, binding status, parity, and eval generated outputs are current.

### Wave 5 — rollout, full validation, and evidence report

**Scope**

- Run full dev/prod/browser/SSR/hydration/binding/eval validation.
- Record matrix outcomes and any intentional divergences in this document or a
  linked evidence report.
- Run the deterministic `codegen-size` and production `bundle-size` ratio
  harnesses, and smoke-test development overhead on spread-heavy forms.
- Apply the compat-mode gate in section 11.

**Dependencies:** all preceding applicable waves.

**Acceptance:** all commands in section 9 pass, all changesets are present,
and no open failing/skip/todo pin remains.

## 8. Risks and mitigations

| Risk | Mitigation / acceptance oracle |
| --- | --- |
| False positive for intentional text commit | Warning, not error; explicit JS-only suppression; both input+change is accepted; read-only/disabled excluded. |
| Static/runtime scope drift | One shared classifier/table; runtime uses normalized live type; parameterized cross-path tests. |
| Duplicate compiler + runtime warning | Static-handled dev metadata and per-build-generation range dedupe; explicit count and watch-reintroduction tests. |
| Spread source-order mistakes | Any spread defers to one final-props runtime check; no per-key warning. |
| Dynamic transition missed by one-shot state | Last offending signature resets when valid and can warn on a later regression. |
| Production overhead | Assert semantic silence in `octane-prod`; measure structure only through the existing deterministic codegen-size and bundle-size ratio harnesses, not private helper substrings. |
| Custom/component callback breakage | Namespace/local-name restriction and binding/eval negative controls. |
| Diagnostic changes event behavior | Diagnostic record is independent of controlled state; event-order matrix runs before and after. |
| Checkable restore fix breaks native ordering | Trusted Chromium C1-C4/R1-R3/D1-D3 plus existing controlled/select tests. |
| jsdom gives false confidence | Activation rollback and preventDefault acceptance is Chromium-only; jsdom remains a fast subset. |
| Volar/build disagree | Shared classifier and golden code/range/message tests in both local results, plus an editor-consumer integration test; never encode a warning in `VolarMappingsResult.errors`. |
| Generated docs drift | Edit RuleSync/status/ledger/corpus sources and run their `--check` commands. |
| Warning breaks first-party consumers | Gate a checked-in repository-wide classifier inventory plus package-specific dynamic host-factory/spread fixtures; classify bindings, website/playground, MCP, and eval sources before rollout. |

## 9. Validation commands

Use the repository-local binaries. Exact new filenames/project names may be
adjusted during Wave 0, but the final equivalent gates are mandatory.

Focused iteration:

```bash
./node_modules/.bin/vitest run packages/octane/tests/native-change-diagnostic.test.ts --project octane --reporter=verbose
./node_modules/.bin/vitest run packages/octane/tests/differential/native-change-matrix.test.ts --project octane --reporter=verbose
./node_modules/.bin/vitest run packages/octane/tests/differential/native-change-matrix.test.ts --project octane-prod --reporter=verbose
./node_modules/.bin/vitest run packages/octane/tests/conformance/controlled-input.test.ts packages/octane/tests/conformance/controlled-restore.test.ts packages/octane/tests/controlled-checkable-native-events.test.tsrx --project octane --reporter=verbose
./node_modules/.bin/vitest run --project octane-events-browser --reporter=verbose
./node_modules/.bin/vitest run --project testing-library --reporter=verbose
./node_modules/.bin/vitest run --project mdx --reporter=verbose
./node_modules/.bin/vitest run --project octane-mcp-server --reporter=verbose
./node_modules/.bin/vitest run --project website --reporter=verbose
./node_modules/.bin/vitest run --project website-mcp --reporter=verbose
```

If Chromium is absent:

```bash
pnpm --filter octane exec playwright install chromium
```

External editor-consumer gate, from the coordinated `Ripple-TS/ripple`
checkout (the new test names are part of Wave 1):

```bash
pnpm vitest run packages/typescript-plugin/tests/octane-diagnostics.test.js packages/language-server/tests/compileDiagnosticPlugin.test.js
pnpm typecheck
pnpm format:check
pnpm changeset:check
pnpm --filter @ripple-ts/vscode-plugin build-and-package
```

The language-server test must issue an LSP document-diagnostic request for an
Octane file, not merely inspect `TSRXVirtualCode.diagnostics`. Record the
passing Ripple commit and released package versions in the evidence report.

Generated-source checks:

```bash
pnpm rules:generate
pnpm rules:check
pnpm bindings:status
pnpm bindings:status:check
pnpm native-events:diagnostics
pnpm native-events:diagnostics:check
pnpm react-parity:generate
pnpm react-parity:check
pnpm --filter @octanejs/evals corpus:generate
pnpm --filter @octanejs/evals corpus:check
pnpm --filter @octanejs/evals test
pnpm changeset:check
```

Deterministic production-size gates:

```bash
pnpm --filter octane-codegen-size-bench bench
pnpm --filter octane-bundle-size-bench bench
node benchmarks/bench.mjs --ratios codegen-size bundle-size
```

Final repository gates:

```bash
pnpm test
pnpm typecheck
pnpm test:markers:check
pnpm format:check
```

`pnpm format:check` is mandatory after every file change, not a replacement for
the focused/full behavioral runs.

## 10. Definition of done

- Core `onChange` is still the delegated native change event in every mode.
- `OCTANE_NATIVE_TEXT_ONCHANGE` has a stable warning code, actionable
  phase-preserving fix, precise source range, and documented severity.
- Static known sites warn through direct compiler and build adapters, the local
  Volar result carries the same structured diagnostic, and the integrated
  editor consumer renders it at warning severity; ambiguous uncontrolled sites
  warn in development after final props resolve.
- Literal output JSX, value-position JSX, direct createElement/de-opt, spreads,
  hydration, and portals follow the ownership table without duplicates.
- Native commit intent has a tested, non-serialized explicit path.
- Select, checkables, custom elements, components, and library callbacks are
  quiet.
- Same-source evidence covers text input, textarea, select, checkbox/radio,
  composition protocol, programmatic writes, capture, event order, and
  preventDefault, including intermediate live properties.
- Browser-only activation claims pass in Chromium.
- Any controlled checkable-onChange restoration defect exposed by the matrix
  is fixed as native correctness before docs claim support.
- Docs, website/playground warning UI, Testing Library, affected bindings,
  MCP/agent guidance, evals, RuleSync outputs, binding status, and parity ledger
  are synchronized; the repository-wide diagnostic-site inventory has no
  unreviewed entry.
- Dev/prod, SSR/hydration, browser, typecheck, marker, formatting, and full test
  gates pass with changesets present.

## 11. Compat-mode recommendation and gate

Do not open a compat-mode implementation as part of this direction. The known
text-input difference is intentional and is proportionately addressed by the
warning, explicit intent, docs, bindings, and migration evidence.

After Wave 5, a separate RFC may be justified only if all of the following are
true:

1. The divergence is reproduced in a real browser with the same-source matrix,
   not inferred from React internals or jsdom.
2. It causes at least two material real-ecosystem integration failures (or a
   measured eval/migration failure rate), after accidental text host wiring and
   native controlled-state bugs are fixed.
3. The use case cannot reasonably adopt `onInput`, native commit intent, or a
   binding-local adapter without losing required semantics.
4. The proposal specifies opt-in scope, SSR/hydration behavior, event ordering,
   cancellation, bundle/runtime cost, and Testing Library behavior without
   changing native core defaults.

Before opening that RFC, repeat the checkable/radio subset in Firefox and
WebKit as an evidence sweep. Chromium remains the required CI baseline for this
plan, but a compatibility proposal should not be justified by one engine's
incidental behavior.

React's checkable `preventDefault()` behavior and value-tracker deduplication
are plausible evidence inputs because they are semantic rather than cosmetic.
They are not, by themselves, approval to implement compatibility. A later RFC
must remain separate so this plan cannot accidentally grow synthetic semantics
while fixing diagnostics or native controlled restoration.

## 12. Open questions before Wave 1

1. Confirm the public prop spelling `suppressNativeChangeWarning`. It is the
   recommended name because it mirrors existing JS-only warning suppressions;
   changing it after release would be user-facing churn.
2. Confirm `number` remains in the text-entry diagnostic family. This plan
   matches current `isTextEntry`; broadening/narrowing should be a separately
   evidenced policy change.
3. Classify Base UI's hidden controlled number input: per-edit bug or genuine
   native commit intent. Its behavioral test should decide whether to migrate
   to `onInput` or add suppression.
4. Confirm Wave 0's controlled checkbox/radio `onChange` restoration probe in
   Chromium and choose the smallest restore deferral that preserves all C/D/R
   rows.
5. Decide which React parity ledger entries gain native public evidence versus
   remaining synthetic non-goals; do not bulk-reclassify the plugin suite.
6. Assign the cross-repository owner and record the `Ripple-TS/ripple` PR plus
   released minimum versions for `@tsrx/typescript-plugin` and
   `@ripple-ts/language-server`. The owning packages are known, but release
   sequencing is still a rollout dependency.
