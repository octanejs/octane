---
'@octanejs/hook-form': patch
---

New binding: `@octanejs/hook-form` — the complete react-hook-form 7.81.0 source ported onto octane's hooks (useForm, useController/Controller, useFieldArray, useWatch/Watch, useFormState/FormStateSubscribe, FormProvider/useFormContext, Form, resolvers, SSR). One deliberate API divergence from upstream: octane events are native, so `register()`/`field` expose the per-keystroke handler as `onInput` instead of `onChange` (option names and semantics — `mode: 'onChange'` etc. — are unchanged). Ships with react-hook-form's own test suite ported (~1,200 tests) plus differential tests asserting byte-identical DOM against the real react-hook-form.
