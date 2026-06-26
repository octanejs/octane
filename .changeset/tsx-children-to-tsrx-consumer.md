---
"octane": patch
---

Fix JSX backwards-compat interop: a React-style `.tsx` parent now correctly passes
children to a `.tsrx` `{props.children}` consumer (previously the children were
dropped, so e.g. a `.tsx` app entry wrapping `.tsrx` provider components —
`QueryClientProvider` / `RouterProvider` — rendered the providers but never their
subtree, blanking the page).

- `createElement`: for a COMPONENT descriptor, positional children are now mirrored
  into `props.children` (React's `createElement` contract). A component reaches its
  body through `componentSlot`, which forwards `props` only — so `{props.children}`
  could not see positional children. Host descriptors keep using
  `descriptor.children` via the de-opt path (unchanged).
- `deoptItemBody`: a COMPONENT descriptor appearing as an element of an array child
  (a `.tsx` parent passing MULTIPLE children) now mounts through a nested
  `childSlot` (a real Block with hooks/reconciliation) instead of throwing on the
  host-only de-opt rebuild path.
