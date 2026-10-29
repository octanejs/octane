---
'octane': patch
---

In a Strong module, the React-shaped host prop types imported from `octane` (`ComponentProps<'span'>`, `ComponentPropsWithoutRef<'div'>`, `HTMLAttributes<T>`, `SVGProps<T>`, and the rest) now describe Strong hosts: they require `TrustedHTML` for `dangerouslySetInnerHTML` and exclude `suppressHydrationWarning` and `suppressNativeChangeWarning`. A shadcn-style wrapper that spreads its props onto a host no longer fails type checking with TS2322, and its callers must pass `trustHTML(…)` to it, as they would to the host. These types still satisfy a compatibility component's props. A `.ts` module that declares host props for Strong components can import them from the new type-only `octane/strong` entry.
