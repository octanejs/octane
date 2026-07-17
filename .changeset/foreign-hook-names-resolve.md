---
'octane': patch
---

The compiler no longer claims a call as an octane builtin hook when its name is
bound by an import from another module. A library hook whose name collides with
a base hook (`useId` from a React-parity binding like `@octanejs/aria`,
`useState`-alikes, …) previously had the octane builtin's runtime import
injected over it — a duplicate-identifier parse error in the compiled module,
and the wrong function at the call site. Non-octane import bindings now shadow
the builtin spelling everywhere the bare-name classification applies (hook
slotting, the JS-loop guard, and the `useState` third-tuple getter analysis);
such calls take the custom-hook path with the standard trailing call-site slot.
