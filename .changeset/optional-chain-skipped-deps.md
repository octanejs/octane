---
'octane': patch
---

Stop inferred hook dependencies, compiler-memoized `use()` arguments, and server-rendered prop creations from reading values an optional chain skips. `run?.(options.label)` and `value?.[options.key]` no longer throw when `run` or `value` is missing and `options` is undefined, and no longer call an `options.label` getter before the authored code would. When the receiver exists, the dependency still follows `options.label` as an own data property.
