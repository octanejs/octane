# Formisch for React

Formisch is a schema-based, headless form library for React. It manages form state and validation. It is type-safe, fast by default and its bundle size is small due to its modular design. Try it out in our [playground](https://stackblitz.com/edit/formisch-playground-react)!

Formisch is also available for [Preact][formisch-preact], [Qwik][formisch-qwik], [SolidJS][formisch-solid], [Svelte][formisch-svelte] and [Vue][formisch-vue].

## Highlights

- Small bundle size starting at 2.5 kB
- Schema-based validation with Valibot
- Type safety with autocompletion in editor
- Open source and fully tested with 100 % coverage
- It's fast – re-renders only if necessary
- Minimal, readable and well thought out API
- Supports all native HTML form fields

## Example

Every form starts with the `useForm` hook. It initializes your form's store based on the provided Valibot schema and infers its types. Next, wrap your form in the `<Form />` component. It's a thin layer around the native `<form />` element that handles form validation and submission. Then, you can access the state of a field with the `useField` hook or the `<Field />` component to connect your inputs.

```tsx
import { Field, Form, useForm } from '@formisch/react';
import * as v from 'valibot';

const LoginSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

export default function LoginPage() {
  const loginForm = useForm({
    schema: LoginSchema,
  });

  return (
    <Form of={loginForm} onSubmit={(output, event) => console.log(output)}>
      <Field of={loginForm} path={['email']}>
        {(field) => (
          <div>
            <input {...field.props} value={field.input} type="email" />
            {field.errors && <div>{field.errors[0]}</div>}
          </div>
        )}
      </Field>
      <Field of={loginForm} path={['password']}>
        {(field) => (
          <div>
            <input {...field.props} value={field.input} type="password" />
            {field.errors && <div>{field.errors[0]}</div>}
          </div>
        )}
      </Field>
      <button type="submit">Login</button>
    </Form>
  );
}
```

In addition, Formisch offers several functions (we call them "methods") that can be used to read and manipulate the form state. These include `focus`, `getDeepErrorEntries`, `getDeepErrors`, `getDirtyInput`, `getDirtyPaths`, `getErrors`, `getInput`, `handleSubmit`, `insert`, `isDirty`, `isEdited`, `isTouched`, `isValid`, `move`, `pickDirty`, `remove`, `replace`, `reset`, `setErrors`, `setInput`, `submit`, `swap` and `validate`. These methods allow you to control the form programmatically.

## Comparison

What makes Formisch unique is its framework-agnostic core, which is fully native to the framework you are using. It works by inserting framework-specific reactivity blocks when the core package is built, giving you native performance for any UI update. A modular methods API keeps bundles starting at just ~2.5 kB by only including the methods you import, and end-to-end type safety covers deeply nested paths and field arrays with TypeScript inference that stays fast even as forms grow.

For a side-by-side look at how Formisch compares to React Hook Form and TanStack Form, see the [comparison guide](https://formisch.dev/react/guides/comparison/).

## Vision

My vision for Formisch is to create a framework-agnostic platform similar to [Vite](https://vite.dev/), but for forms — a shared core that lets the same mental model and codebase work natively across every modern UI framework.

## Partners

Thanks to our partners who support the development! [Join them](https://github.com/sponsors/fabian-hiller) and contribute to the sustainability of open source software!

![Partners of Formisch](https://github.com/open-circle/formisch/blob/main/partners.webp?raw=true)

## Feedback

Find a bug or have an idea how to improve the library? Please fill out an [issue](https://github.com/open-circle/formisch/issues/new). Together we can make forms even better!

## License

This project is available free of charge and licensed under the [MIT license](https://github.com/open-circle/formisch/blob/main/LICENSE.md).

[formisch-preact]: https://github.com/open-circle/formisch/tree/main/frameworks/preact
[formisch-qwik]: https://github.com/open-circle/formisch/tree/main/frameworks/qwik
[formisch-solid]: https://github.com/open-circle/formisch/tree/main/frameworks/solid
[formisch-svelte]: https://github.com/open-circle/formisch/tree/main/frameworks/svelte
[formisch-vue]: https://github.com/open-circle/formisch/tree/main/frameworks/vue
