type Props = { className?: string } & Record<string, unknown>;

export interface FieldProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'vertical' | 'horizontal' | 'responsive' | null;
}

export interface FieldSeparatorProps extends Record<string, unknown> {
	className?: string;
	children?: unknown;
}

export interface FieldErrorProps extends Record<string, unknown> {
	className?: string;
	children?: unknown;
	errors?: Array<{ message?: string } | undefined>;
}

export function FieldSet(props: Props): any;
export function FieldLegend(props: Props & { variant?: 'legend' | 'label' }): any;
export function FieldGroup(props: Props): any;
export function Field(props: FieldProps): any;
export function FieldContent(props: Props): any;
export function FieldLabel(props: Props): any;
export function FieldTitle(props: Props): any;
export function FieldDescription(props: Props): any;
export function FieldSeparator(props: FieldSeparatorProps): any;
export function FieldError(props: FieldErrorProps): any;
