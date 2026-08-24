/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';
import { handleSubmit } from './methods.js';
import { useField, useFieldArray } from './hooks.js';
import type { FieldArrayProps, FieldProps, FormProps, FormSchema, RequiredPath } from './types.js';

export function Form<TSchema extends FormSchema>(props: FormProps<TSchema>): OctaneNode {
	const { of, onSubmit, children, ...formProps } = props;
	const submitHandler = handleSubmit(of, onSubmit ?? (() => undefined));
	return (
		<form {...formProps} noValidate={true} onSubmit={submitHandler}>
			{children}
		</form>
	);
}

export function Field<TSchema extends FormSchema, TFieldPath extends RequiredPath>(
	props: FieldProps<TSchema, TFieldPath>,
): OctaneNode {
	return props.children(useField(props.of, { path: props.path }));
}

export function FieldArray<TSchema extends FormSchema, TFieldArrayPath extends RequiredPath>(
	props: FieldArrayProps<TSchema, TFieldArrayPath>,
): OctaneNode {
	return props.children(useFieldArray(props.of, { path: props.path }));
}
