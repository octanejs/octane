# @octanejs/hook-form

## 0.1.3

### Patch Changes

- d173805: Preserve compiler-driven state-hook getters on client and server while keeping
  getter-free calls on the existing two-item path, including bounded server
  render-phase updates and immediate getter reads. Isolate `useId` by root with
  working identifier prefixes. Harden first-reveal ViewTransitions and compiler
  hook discovery for aliases, namespaces, dependency inference, and plain-loop
  errors.

  Consume Octane as an exact singleton peer from every framework binding and
  publish a Node 22 minimum engine requirement across core and the bindings.
  Compile installed raw-source binding graphs through Vite while preserving
  manifest-declared manual hook-slot directories.

- Updated dependencies [d173805]
- Updated dependencies [85e589e]
- Updated dependencies [2979f42]
- Updated dependencies [b41a91a]
- Updated dependencies [e55f6ed]
- Updated dependencies [d173805]
- Updated dependencies [813fd50]
  - octane@0.1.6

## 0.1.2

### Patch Changes

- Updated dependencies [940ae5a]
- Updated dependencies [6fceaf3]
- Updated dependencies [62da8cc]
- Updated dependencies [e737057]
  - octane@0.1.5

## 0.1.1

### Patch Changes

- 2942afb: New binding: `@octanejs/hook-form` — the complete react-hook-form 7.81.0 source ported onto octane's hooks (useForm, useController/Controller, useFieldArray, useWatch/Watch, useFormState/FormStateSubscribe, FormProvider/useFormContext, Form, resolvers, SSR). One deliberate API divergence from upstream: octane events are native, so `register()`/`field` expose the per-keystroke handler as `onInput` instead of `onChange` (option names and semantics — `mode: 'onChange'` etc. — are unchanged). Ships with react-hook-form's own test suite ported (~1,200 tests) plus differential tests asserting byte-identical DOM against the real react-hook-form.
- Updated dependencies [05fdef8]
- Updated dependencies [e9ebfbf]
- Updated dependencies [4ac4c98]
- Updated dependencies [c2129eb]
- Updated dependencies [4ac4c98]
- Updated dependencies [8a44bb5]
- Updated dependencies [6b0c244]
- Updated dependencies [d3cf678]
- Updated dependencies [05fdef8]
- Updated dependencies [d19d4f3]
- Updated dependencies [7e84258]
- Updated dependencies [2f8c6ed]
- Updated dependencies [8de4584]
- Updated dependencies [9be6ba5]
- Updated dependencies [db409de]
- Updated dependencies [4f3c6c8]
- Updated dependencies [62c3c4e]
- Updated dependencies [3c56d95]
- Updated dependencies [4c5b1d0]
- Updated dependencies [b732399]
- Updated dependencies [6d27cb0]
- Updated dependencies [a3784b1]
- Updated dependencies [fa77edf]
- Updated dependencies [f5c9dba]
- Updated dependencies [12d5410]
- Updated dependencies [d71f1fc]
- Updated dependencies [2f8c6ed]
- Updated dependencies [63e51e8]
- Updated dependencies [6d3b269]
- Updated dependencies [b171c6d]
- Updated dependencies [7f3d9c9]
- Updated dependencies [820baaf]
- Updated dependencies [c36cb32]
- Updated dependencies [c33f409]
- Updated dependencies [63e51e8]
- Updated dependencies [8fc8554]
- Updated dependencies [569daad]
- Updated dependencies [6b7b727]
- Updated dependencies [2ce7bc5]
- Updated dependencies [c6a23f5]
- Updated dependencies [c93aad5]
- Updated dependencies [2942afb]
- Updated dependencies [388b23c]
- Updated dependencies [352cff1]
- Updated dependencies [c7989eb]
- Updated dependencies [dda2854]
- Updated dependencies [dda2854]
- Updated dependencies [3a9d855]
- Updated dependencies [1f85217]
  - octane@0.1.4
