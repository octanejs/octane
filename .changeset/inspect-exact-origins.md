---
'octane': patch
---

Extend the opt-in compiler inspection surface (`compile(source, file, { inspect:
true })`) so source↔output navigation reaches constructs that leave no trace of
themselves in the emit. `result.inspect.segments` entries now carry `exact`,
marking a segment the compiler itself anchored on an authored span rather than
one inferred from the print's map; control-flow directive keywords (`@if`,
`@else`, `@for`, `@empty`, `@switch`, `@case`, `@default`, `@try`, `@pending`,
`@catch`), event-attribute names, and scoped `<style>` blocks claim the code
they lowered to through it. `result.inspect.templates` gains SSR entries (each
static run's exact bytes plus its origins) and `result.inspect.aliases` relates
an authored span to the origin that owns its emission. `octane/compiler/volar`
adds `compileTypesInspection`, a navigation-only sibling of
`compileToVolarMappings`: same parse, same transform, same output bytes, without
the Volar mapping layer, so nothing here can perturb the language server.
Emitted code and source maps remain byte-identical with the option on or off,
and normal compiles skip all recording.
