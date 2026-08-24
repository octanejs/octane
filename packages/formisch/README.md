# @octanejs/formisch

Clean-room Formisch binding for Octane.

```tsrx
import { Field, Form, useForm } from '@octanejs/formisch';
import * as v from 'valibot';

const LoginSchema = v.object({
  email: v.pipe(v.string(), v.email()),
});

export function Login() @{
  const form = useForm({ schema: LoginSchema });
  <Form of={form} onSubmit={(output) => console.log(output)}>
    <Field of={form} path={['email']}>
      {(field) => <input {...field.props} value={field.input} type="email" />}
    </Field>
  </Form>
}
```

The binding uses Octane's native `input`, `change`, focus, blur, and submit
events. It includes the documented hooks, headless components, store state,
validation modes, dirty-state helpers, and field-array methods.
