---
'octane': patch
---

Compile `.tsrx` modules faster. Most compiles scope-analyzed the same module
two or more times, because each compiler pass that left the module unchanged
handed it to a pass that analyzed it again. Passes now share one analysis per
module tree, which removes more than half of those walks. Compiled output is
unchanged.
