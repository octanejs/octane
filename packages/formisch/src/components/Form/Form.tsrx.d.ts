import type { FormSchema, SubmitEventHandler } from '../../core/index.ts';
import type { FormStore } from '../../types/index.ts';
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type FormProps<TSchema extends FormSchema = FormSchema> = Omit<
	Octane.FormHTMLAttributes<HTMLFormElement>,
	'onSubmit' | 'novalidate' | 'noValidate' | 'children'
> & {
	readonly of: FormStore<TSchema>;
	readonly onSubmit: SubmitEventHandler<TSchema>;
	readonly children?: OctaneNode;
};

export declare function Form<TSchema extends FormSchema>(props: FormProps<TSchema>): OctaneNode;
