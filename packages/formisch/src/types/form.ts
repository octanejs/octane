import type { BaseFormStore, FormSchema } from '../core/index.ts';

export interface FormStore<TSchema extends FormSchema = FormSchema> extends BaseFormStore<TSchema> {
	readonly isSubmitting: boolean;
	readonly isSubmitted: boolean;
	readonly isValidating: boolean;
	readonly isTouched: boolean;
	readonly isEdited: boolean;
	readonly isDirty: boolean;
	readonly isValid: boolean;
	readonly errors: [string, ...string[]] | null;
}
