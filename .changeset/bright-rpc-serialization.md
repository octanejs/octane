---
'@octanejs/astro': patch
octane: patch
---

Upgrade `devalue` to 6.0.3 for faster serialization and improved malformed-input handling. Octane declares the `Float16Array` type devalue's typings name, so strict consumers on an ES2024 `lib` keep compiling.
