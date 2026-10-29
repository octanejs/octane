---
'@octanejs/next-themes': patch
---

Add `@octanejs/next-themes`, an Octane port of `next-themes` 0.4.6. It provides `ThemeProvider` with every prop (`attribute`, `defaultTheme`, `enableSystem`, `enableColorScheme`, `storageKey`, `forcedTheme`, `disableTransitionOnChange`, `themes`, `value`, `nonce`, `scriptProps`), the `useTheme` hook, and the `Attribute`, `ThemeProviderProps`, and `UseThemeProps` types. The inline script that applies the saved theme before first paint renders through `octane/server`, and hydration adopts it.
