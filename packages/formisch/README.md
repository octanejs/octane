# @octanejs/formisch

Octane-native bindings for Formisch.

This package targets Formisch `1.0.0-rc.0` and vendors its framework-selected
core and modular methods at commit
`4c494fd8cf105efd04a4b179e9c090595a0bf041`. It does not require React at runtime
or in its public types.

Formisch's core and method packages are workspace internals rather than
independently installable npm dependencies. The published `@formisch/react`
package is used only as a development-time differential oracle.

The adapter preserves Formisch's programmatic `onChange` and validation-mode
names. Native text controls use `onInput`; selects, checkboxes, and radios use
native `onChange`.

## Install

```sh
npm install @octanejs/formisch valibot
pnpm add @octanejs/formisch valibot
```

## Example

```tsx
import { Form, useField, useForm } from '@octanejs/formisch';
import * as v from 'valibot';

const schema = v.object({
	email: v.pipe(v.string(), v.email('Enter a valid email')),
});

function EmailForm() @{
	const form = useForm({ schema, validate: 'input' });
	const email = useField(form, { path: ['email'] });

	<Form of={form} onSubmit={async (output, event) => {
		console.log(output.email, event);
	}}>
		<input
			name={email.props.name}
			ref={email.props.ref}
			value={email.input as string}
			onInput={email.props.onInput}
			onBlur={email.props.onBlur}
		/>
		@if (email.errors) {
			<p>{email.errors[0]}</p>
		}
		<button type="submit">Submit</button>
	</Form>
}
```

`useField` also exposes `props.onChange` for native select, checkbox, and radio
controls. Its programmatic `field.onChange(value)` callback keeps Formisch's
upstream name and triggers input/change validation.

All Formisch modular methods—including `getInput`, `setInput`, `validate`,
`handleSubmit`, `reset`, and field-array operations—are exported from the package
root.

## Compatibility

- Upstream: `@formisch/react@1.0.0-rc.0`
- Valibot: `^1.4.1`
- Octane: exact workspace peer during development
- React and React types: development-only differential oracle; neither is a
  runtime or public-type dependency

See [UPSTREAM.md](./UPSTREAM.md) for source provenance and `status.json` for the
current divergence ledger.
