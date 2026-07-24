export interface NativeSelectProps extends Record<string, unknown> {
	className?: string;
	size?: 'sm' | 'default';
}

export function NativeSelect(props: NativeSelectProps): any;
export function NativeSelectOption(props: { className?: string } & Record<string, unknown>): any;
export function NativeSelectOptGroup(props: { className?: string } & Record<string, unknown>): any;
