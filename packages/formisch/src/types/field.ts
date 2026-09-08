import type {
	FieldElement,
	FormSchema,
	PartialValues,
	PathValue,
	RequiredPath,
	ValidArrayPath,
	ValidPath,
} from '../core/index.ts';
import type * as v from 'valibot';

export interface FieldElementProps {
	readonly name: string;
	readonly autoFocus: boolean;
	readonly ref: (element: FieldElement | null) => void;
	readonly onFocus: (event: FocusEvent) => void;
	readonly onInput: (event: InputEvent) => void;
	readonly onChange: (event: Event) => void;
	readonly onBlur: (event: FocusEvent) => void;
}

export interface FieldStore<
	TSchema extends FormSchema = FormSchema,
	TFieldPath extends RequiredPath = RequiredPath,
> {
	readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
	readonly input: PartialValues<PathValue<v.InferInput<TSchema>, TFieldPath>>;
	readonly errors: [string, ...string[]] | null;
	readonly isTouched: boolean;
	readonly isEdited: boolean;
	readonly isDirty: boolean;
	readonly isValid: boolean;
	readonly onChange: (value: PartialValues<PathValue<v.InferInput<TSchema>, TFieldPath>>) => void;
	readonly props: FieldElementProps;
}

export interface FieldArrayStore<
	TSchema extends FormSchema = FormSchema,
	TFieldArrayPath extends RequiredPath = RequiredPath,
> {
	readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
	readonly items: string[];
	readonly errors: [string, ...string[]] | null;
	readonly isTouched: boolean;
	readonly isEdited: boolean;
	readonly isDirty: boolean;
	readonly isValid: boolean;
}
