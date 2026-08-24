import * as Formisch from '@formisch/react';
import {
	Field,
	FieldArray,
	Form,
	focus,
	getDeepError,
	getDeepErrorEntries,
	getDeepErrorEntry,
	getDeepErrors,
	getDirtyInput,
	getDirtyPaths,
	getErrors,
	getInput,
	handleSubmit,
	insert,
	isDirty,
	isEdited,
	isTouched,
	isValid,
	move,
	pickDirty,
	remove,
	replace,
	reset,
	setErrors,
	setInput,
	submit,
	swap,
	useField,
	useFieldArray,
	useForm,
	validate,
} from '@formisch/react';

declare function expectType<T>(value: T): void;

Formisch satisfies object;
expectType<Function>(Field);
expectType<Function>(FieldArray);
expectType<Function>(Form);
expectType<Function>(focus);
expectType<Function>(getDeepError);
expectType<Function>(getDeepErrorEntries);
expectType<Function>(getDeepErrorEntry);
expectType<Function>(getDeepErrors);
expectType<Function>(getDirtyInput);
expectType<Function>(getDirtyPaths);
expectType<Function>(getErrors);
expectType<Function>(getInput);
expectType<Function>(handleSubmit);
expectType<Function>(insert);
expectType<Function>(isDirty);
expectType<Function>(isEdited);
expectType<Function>(isTouched);
expectType<Function>(isValid);
expectType<Function>(move);
expectType<Function>(pickDirty);
expectType<Function>(remove);
expectType<Function>(replace);
expectType<Function>(reset);
expectType<Function>(setErrors);
expectType<Function>(setInput);
expectType<Function>(submit);
expectType<Function>(swap);
expectType<Function>(useField);
expectType<Function>(useFieldArray);
expectType<Function>(useForm);
expectType<Function>(validate);

// @ts-expect-error an upstream hook is not a number
const invalidExport: number = useForm;
void invalidExport;
