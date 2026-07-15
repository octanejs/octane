# @octanejs/tanstack-form

[TanStack Form](https://tanstack.com/form) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

This package ports `@tanstack/react-form@1.33.2` onto Octane while reusing
`@tanstack/form-core@1.33.2` unchanged. The runtime export surface matches the
React adapter, so migration starts by changing the package import:

```ts
// before
import { useForm } from '@tanstack/react-form'

// after
import { useForm } from '@octanejs/tanstack-form'
```

The renderer-bearing adapter modules are authored as `.tsrx` and compiled by
Octane. Matching `.tsrx.d.ts` companions preserve the complete upstream generic
surface for TypeScript consumers.

```tsx
import { useForm } from '@octanejs/tanstack-form'

export function ProfileForm() @{
  const form = useForm({
    defaultValues: { name: '' },
    onSubmit: ({ value }) => console.log(value),
  })

  <form
    onSubmit={(event) => {
      event.preventDefault()
      void form.handleSubmit()
    }}
  >
    <form.Field
      name="name"
      validators={{
        onChange: ({ value }) =>
          value.length === 0 ? 'Name is required' : undefined,
      }}
    >
      {(field) => (
        <label>
          Name
          <input
            value={field.state.value}
            onBlur={field.handleBlur}
            onInput={(event) => field.handleChange(event.target.value)}
          />
          @if (field.state.meta.errors.length > 0) {
            <span>{field.state.meta.errors.join(', ')}</span>
          }
        </label>
      )}
    </form.Field>
    <form.Subscribe selector={(state) => state.canSubmit}>
      {(canSubmit) => <button disabled={!canSubmit}>Submit</button>}
    </form.Subscribe>
  </form>
}
```

## API

The adapter includes `useForm`, `useField`, `useFormGroup`, `useFieldGroup`,
`createFormHook`, `createFormHookContexts`, and
`useIsomorphicLayoutEffect`. It also re-exports `@tanstack/form-core` and the
`useSelector`/`useStore` helpers from `@octanejs/tanstack-store`.

Octane uses native DOM events. Text controls should call
`field.handleChange()` from `onInput`; native `change` fires only on
blur/commit. TanStack Form option names such as `onChange`, validators, and
listener keys retain their upstream spelling.

Server rendering through `octane/server` is supported. Field and form
subscriptions render their initial snapshots without browser-only setup.

## Verification

The port runs TanStack Form's React adapter tests against Octane, including
validation, async validation and debounce, linked fields, arrays, form groups,
component contexts, submission, reset, and subscription behavior. A
differential test compiles the same `.tsrx` form for Octane and React and
compares its DOM after value, validation, array, and reset interactions. The
upstream compile-time suite and an SSR fixture are also included.

Current scope and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).

## License

MIT — contains source derived from
[TanStack Form](https://github.com/TanStack/form) (MIT), adapted for Octane.
