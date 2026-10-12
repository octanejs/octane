---
'octane': patch
'@octanejs/mdx': patch
---

Extend the fix for stale importer values to universal renderer modules, modules that render renderer-owned regions, and `.mdx` documents. A value exported beside their components, such as an `.mdx` document's `frontmatter`, now propagates a hot update to its importers, as it does in DOM modules. An `.mdx` document also hands each edit to the wrapper its importers already hold, so consecutive edits reach live mounts instead of only the first.
