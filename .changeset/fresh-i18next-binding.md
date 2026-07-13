---
'@octanejs/i18next': patch
'@octanejs/mcp-server': patch
---

Add the `@octanejs/i18next` binding, porting react-i18next 17.0.9 hooks,
providers, rich translations, ICU declarations, HOCs, Suspense namespace
loading, and SSR integration onto Octane while reusing i18next unchanged.

Teach the MCP binding registry to route react-i18next users to the maintained
Octane package.
