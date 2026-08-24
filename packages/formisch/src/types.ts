import type { OctaneNode } from 'octane';
import type { BaseIssue, BaseSchema, BaseSchemaAsync, InferInput, InferOutput } from 'valibot';

export type PathKey = string | number;
export type Path = readonly PathKey[];
export type RequiredPath = readonly [PathKey, ...PathKey[]];
export type ValidPath<_TInput, TPath extends RequiredPath = RequiredPath> = TPath;
export type ValidArrayPath<_TInput, TPath extends RequiredPath = RequiredPath> = TPath;
export type PathValue<TValue, TPath extends Path> = TPath extends readonly [
	infer TKey,
	...infer TRest,
]
	? TKey extends keyof TValue
		? PathValue<TValue[TKey], Extract<TRest, Path>>
		: TKey extends number
			? TValue extends readonly (infer TItem)[]
				? PathValue<TItem, Extract<TRest, Path>>
				: unknown
			: unknown
	: TValue;

export type DeepPartial<TValue> = TValue extends Date | File | Blob
	? TValue
	: TValue extends readonly (infer TItem)[]
		? DeepPartial<TItem>[]
		: TValue extends object
			? { [TKey in keyof TValue]?: DeepPartial<TValue[TKey]> }
			: TValue;
export type PartialValues<TValue> = DeepPartial<TValue> | undefined;
export interface EmptyInput {
	string?: string | undefined;
	number?: number | undefined;
	boolean?: boolean | undefined;
	date?: Date | undefined;
}

export type FormSchema =
	| BaseSchema<unknown, unknown, BaseIssue<unknown>>
	| BaseSchemaAsync<unknown, unknown, BaseIssue<unknown>>;
export type Schema = FormSchema;
export type ValidationMode = 'initial' | 'touch' | 'input' | 'change' | 'blur' | 'submit';
export type ErrorList = [string, ...string[]] | null;

export interface FormConfig<TSchema extends FormSchema = FormSchema> {
	schema: TSchema;
	initialInput?: DeepPartial<InferInput<TSchema>>;
	emptyInput?: EmptyInput;
	validate?: ValidationMode;
	revalidate?: Exclude<ValidationMode, 'initial'>;
}

export interface FormStore<TSchema extends FormSchema = FormSchema> {
	readonly isSubmitting: boolean;
	readonly isSubmitted: boolean;
	readonly isValidating: boolean;
	readonly isTouched: boolean;
	readonly isEdited: boolean;
	readonly isDirty: boolean;
	readonly isValid: boolean;
	readonly errors: ErrorList;
}

export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export interface FieldElementProps {
	name: string;
	autoFocus?: boolean;
	ref: (element: FieldElement | null) => void;
	onInput: (event: Event) => void;
	onChange: (event: Event) => void;
	onFocus: () => void;
	onBlur: () => void;
}

export interface FieldStore<
	TSchema extends FormSchema = FormSchema,
	TFieldPath extends RequiredPath = RequiredPath,
> {
	path: TFieldPath;
	input: PartialValues<PathValue<InferInput<TSchema>, TFieldPath>>;
	errors: ErrorList;
	isTouched: boolean;
	isEdited: boolean;
	isDirty: boolean;
	isValid: boolean;
	onChange: (value: PartialValues<PathValue<InferInput<TSchema>, TFieldPath>>) => void;
	props: FieldElementProps;
}

export interface FieldArrayStore<
	TSchema extends FormSchema = FormSchema,
	TFieldArrayPath extends RequiredPath = RequiredPath,
> {
	path: TFieldArrayPath;
	items: string[];
	errors: ErrorList;
	isTouched: boolean;
	isEdited: boolean;
	isDirty: boolean;
	isValid: boolean;
}

export interface UseFieldConfig<
	_TSchema extends FormSchema = FormSchema,
	TFieldPath extends RequiredPath = RequiredPath,
> {
	path: TFieldPath;
}
export interface UseFieldArrayConfig<
	_TSchema extends FormSchema = FormSchema,
	TFieldArrayPath extends RequiredPath = RequiredPath,
> {
	path: TFieldArrayPath;
}

export type SubmitHandler<TSchema extends FormSchema> = (
	output: InferOutput<TSchema>,
) => void | Promise<void>;
export type SubmitEventHandler<TSchema extends FormSchema> = (
	output: InferOutput<TSchema>,
	event: SubmitEvent,
) => void | Promise<void>;

export interface FormProps<TSchema extends FormSchema> {
	of: FormStore<TSchema>;
	onSubmit?: SubmitEventHandler<TSchema>;
	children?: OctaneNode;
	[key: string]: unknown;
}

export interface FieldProps<TSchema extends FormSchema, TFieldPath extends RequiredPath> {
	of: FormStore<TSchema>;
	path: TFieldPath;
	children: (store: FieldStore<TSchema, TFieldPath>) => OctaneNode;
}

export interface FieldArrayProps<TSchema extends FormSchema, TFieldArrayPath extends RequiredPath> {
	of: FormStore<TSchema>;
	path: TFieldArrayPath;
	children: (store: FieldArrayStore<TSchema, TFieldArrayPath>) => OctaneNode;
}

export interface DeepErrorEntry {
	path: Path;
	errors: [string, ...string[]];
}

export interface PathConfig<TPath extends Path = Path> {
	path?: TPath;
}
export interface SetFormInputConfig<TValue = unknown> {
	input: DeepPartial<TValue>;
}
export interface SetFieldInputConfig<TValue = unknown, TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	input: TValue;
}
export interface SetFormErrorsConfig {
	errors: ErrorList;
}
export interface SetFieldErrorsConfig<TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	errors: ErrorList;
}
export interface ResetFormConfig<TValue = unknown> {
	initialInput?: DeepPartial<TValue>;
}
export interface ResetFieldConfig<TValue = unknown, TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	initialInput?: TValue;
}
export interface FocusFieldConfig<TPath extends RequiredPath = RequiredPath> {
	path?: TPath;
}
export interface ValidateFormConfig {
	focus?: boolean;
}
export interface InsertConfig<TValue = unknown, TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	index?: number;
	input: TValue;
}
export interface RemoveConfig<TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	index: number;
}
export interface ReplaceConfig<TValue = unknown, TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	index: number;
	input: TValue;
}
export interface MoveConfig<TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	from: number;
	to: number;
}
export interface SwapConfig<TPath extends RequiredPath = RequiredPath> {
	path: TPath;
	from: number;
	to: number;
}

export type GetFormInputConfig = PathConfig<[]>;
export type GetFieldInputConfig<
	_TSchema extends FormSchema = FormSchema,
	TPath extends RequiredPath = RequiredPath,
> = { path: TPath };
export type GetFormErrorsConfig = GetFormInputConfig;
export type GetFieldErrorsConfig<
	_TSchema extends FormSchema = FormSchema,
	TPath extends RequiredPath = RequiredPath,
> = GetFieldInputConfig<_TSchema, TPath>;
export type GetFormDeepErrorsConfig = GetFormInputConfig;
export type GetFieldDeepErrorsConfig<
	_TSchema extends FormSchema = FormSchema,
	TPath extends RequiredPath = RequiredPath,
> = GetFieldInputConfig<_TSchema, TPath>;
export type GetFormDeepErrorEntriesConfig = GetFormInputConfig;
export type GetFieldDeepErrorEntriesConfig<
	_TSchema extends FormSchema = FormSchema,
	TPath extends RequiredPath = RequiredPath,
> = GetFieldInputConfig<_TSchema, TPath>;
export type GetFormDirtyInputConfig = GetFormInputConfig;
export type GetFieldDirtyInputConfig<
	_TSchema extends FormSchema = FormSchema,
	TPath extends RequiredPath = RequiredPath,
> = GetFieldInputConfig<_TSchema, TPath>;
export type GetFormDirtyPathsConfig = GetFormInputConfig;
export type GetFieldDirtyPathsConfig<
	_TSchema extends FormSchema = FormSchema,
	TPath extends RequiredPath = RequiredPath,
> = GetFieldInputConfig<_TSchema, TPath>;
export type IsFormDirtyConfig = GetFormInputConfig;
export type IsFieldDirtyConfig<TPath extends RequiredPath = RequiredPath> = { path: TPath };
export type IsFormEditedConfig = GetFormInputConfig;
export type IsFieldEditedConfig<TPath extends RequiredPath = RequiredPath> = { path: TPath };
export type IsFormTouchedConfig = GetFormInputConfig;
export type IsFieldTouchedConfig<TPath extends RequiredPath = RequiredPath> = { path: TPath };
export type IsFormValidConfig = GetFormInputConfig;
export type IsFieldValidConfig<TPath extends RequiredPath = RequiredPath> = { path: TPath };
export interface PickDirtyConfig<TValue = unknown> {
	input: TValue;
}
