# @octanejs/hot-toast

## 0.0.1

### Patch Changes

- 4fc96cf: Add `@octanejs/hot-toast`, an Octane port of `react-hot-toast` 2.6.1: the `toast` API and
  every variant, `Toaster`, `ToastBar`, `ToastIcon`, the icon components, `useToaster`,
  `useToasterStore`, `resolveValue` and the `/headless` entry. The binding catalog now maps
  `react-hot-toast` to it, so `@octanejs/codemod` rewrites `react-hot-toast` imports to the
  binding instead of reporting a package with no binding.
