---
'octane': patch
---

The DOM compiler now builds static templates as structured, origin-carrying
template IR and serializes each completed template once into the unchanged
runtime HTML string ABI. Opt-in compiler inspection exposes both the exact
Program AST used for the module's single esrap print and each hoisted template's
structured IR, enabling playground source-to-generated-code and
source-to-template navigation without reparsing emitted output.
