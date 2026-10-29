---
'octane': patch
---

Compile errors for authoring mistakes now carry a stable `code`, so tools, tests, and agents can recognize an error without matching its message. A mistake only Octane reports has an `OCTANE_*` code, such as `OCTANE_HOOK_IN_LOOP`, `OCTANE_ARM_VALUE_RETURN`, `OCTANE_SERVER_MODULE_EXPORT`, `OCTANE_UNIVERSAL_UNSUPPORTED`, or `OCTANE_VALDI_UNSUPPORTED`. A mistake that `@tsrx/core` also reports on its own targets has core's code: a repeated `ref` is `TSRX2016` and now uses core's message, a `for…in` or C-style `@for` header is `TSRX2015`, and `@for await` on a target without async iteration is `TSRX2024`. Messages are otherwise unchanged.
