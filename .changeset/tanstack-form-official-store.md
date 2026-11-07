---
'@octanejs/tanstack-form': patch
---

Depend on the official TanStack Store adapter, `@tanstack/octane-store`, in place of the retired `@octanejs/tanstack-store`. `useSelector` is re-exported from it, and the deprecated `useStore` alias that `@tanstack/react-form` exports now lives in this package.
