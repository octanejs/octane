import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export interface SlotProps {
	isActive: boolean;
	char: string | null;
	placeholderChar: string | null;
	hasFakeCaret: boolean;
}

export interface RenderProps {
	slots: SlotProps[];
	isFocused: boolean;
	isHovering: boolean;
}

type OTPInputRef<T> =
	((value: T | null) => void) | { current: T | null } | readonly OTPInputRef<T>[] | null;

type OverrideProps<T, R> = Omit<T, keyof R> & R;
type InputElementProps = Omit<Octane.JSX.IntrinsicElements['input'], 'ref'>;

type OTPInputBaseProps = OverrideProps<
	InputElementProps,
	{
		ref?: OTPInputRef<HTMLInputElement>;
		value?: string;
		onChange?: (newValue: string) => unknown;
		maxLength: number;
		textAlign?: 'left' | 'center' | 'right';
		onComplete?: (...args: any[]) => unknown;
		pushPasswordManagerStrategy?: 'increase-width' | 'none';
		pasteTransformer?: (pasted: string) => string;
		containerClassName?: string;
		noScriptCSSFallback?: string | null;
		nonce?: string;
	}
>;

type InputOTPRenderFn = (props: RenderProps) => OctaneNode;

export type OTPInputProps = OTPInputBaseProps &
	(
		| {
				render: InputOTPRenderFn;
				children?: never;
		  }
		| {
				render?: never;
				children: OctaneNode;
		  }
	);
