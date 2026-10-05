---
'octane': minor
'@octanejs/vite-plugin': minor
---

Stop shipping the signal binding runtime in apps that never pass signal
handles through ordinary props.

Since async signals landed, the compiler bound every opaque text, attribute,
control, and textarea hole, such as `{row.label as string}`, as a potential
signal handle in every module. Every app therefore carried the binding runtime
and stamped signal identities on every component. Now such a hole binds a
handle only in a module with an import from `octane/signals`; a type-only
`import type { SignalHandle } from 'octane/signals'` is enough and does not
enable native reads. Modules using DOM bindings keep binding handles, and
`$`-named expressions such as `{props.label$}` still bind everywhere.

This removes 1.7 to 3.3 kB gzip of runtime from the benchmark applications
(rows 38,991 → 37,307 bytes, TodoMVC 44,217 → 41,076, chat 43,638 → 40,347).

An untyped component that renders handles from a lazily loaded signals engine
can either type its props or set the new `opaqueSignalHandles` compiler option
(also accepted by `octane()` and `@octanejs/vite-plugin`) to keep the previous
behavior. In development, a handle that reaches a plain text hole logs an
error naming these fixes instead of silently rendering `[object Object]`.

Hydration through the ordinary writers now matches the signal-aware path it
replaces for these holes: a sibling or whole-output `{expr}` hole whose first
client value is `undefined` discards the server content it cannot adopt, and an
attribute whose first client value is `undefined` removes the server attribute.
