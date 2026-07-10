# @octanejs/hook-form

React Hook Form for the [octane](https://github.com/octanejs/octane) renderer —
the complete react-hook-form 7.81.0 source ported onto octane's hooks:
performant, flexible forms with native-event validation, field arrays, schema
resolvers, `Controller`/`FormProvider`, and SSR.

```tsx
import { useForm } from '@octanejs/hook-form';

export function App() @{
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm({ mode: 'onChange' });

	<form onSubmit={handleSubmit((data) => console.log(data))}>
		<input {...register('email', { required: 'required' })} />
		@if (errors.email) {
			<span role="alert">{errors.email.message as string}</span>
		}
		<button>{'Submit'}</button>
	</form>
}
```

## The one API difference: `onInput`

Octane has **native, delegated events** — no synthetic event layer. The
per-keystroke text event on the platform is `input` (native `change` fires on
blur/commit), so the handler upstream calls `onChange` is exposed as
**`onInput`**:

- `register(name)` returns `{ name, ref, onInput, onBlur }` (upstream:
  `onChange`). `{...register('x')}` spreads work unchanged.
- `useController`'s `field` is `{ value, name, ref, onInput, onBlur, … }`.
  `field.onInput` doubles as the programmatic setter (accepts an event or a
  raw value), exactly like upstream's `field.onChange`.
- `mode: 'onChange'` / `reValidateMode: 'onChange'` option VALUES are
  unchanged — validation still runs per keystroke (driven by native `input`).
- Register OPTIONS keep their upstream names: `register('x', { onChange, onBlur })`
  callbacks are invoked as before.

Everything else — validation modes, `formState` proxy subscriptions,
`useFieldArray`, `useWatch`/`Watch`, `FormStateSubscribe`, `reset`/`setValue`/
`trigger` semantics, SSR via `octane/server` — matches upstream behavior; the
port runs react-hook-form's own ~1,200-test suite (see
`packages/hook-form/tests/`) plus differential tests asserting byte-identical
DOM against the real react-hook-form.

## License

MIT — contains source derived from
[react-hook-form](https://github.com/react-hook-form/react-hook-form)
(MIT, © Beier (Bill) Luo), adapted for octane.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
