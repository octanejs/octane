// Ported from react-hot-toast@2.6.1 src/core/types.ts
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: React element and style types become Octane's
// ElementDescriptor, OctaneNode and CSSProperties.
import type { CSSProperties, ElementDescriptor, OctaneNode } from 'octane';

export type ToastType = 'success' | 'error' | 'loading' | 'blank' | 'custom';
export type ToastPosition =
	'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type Renderable = ElementDescriptor<any> | string | null;

export interface IconTheme {
	primary: string;
	secondary: string;
}

export type ValueFunction<TValue, TArg> = (arg: TArg) => TValue;
export type ValueOrFunction<TValue, TArg> = TValue | ValueFunction<TValue, TArg>;

const isFunction = <TValue, TArg>(
	valOrFunction: ValueOrFunction<TValue, TArg>,
): valOrFunction is ValueFunction<TValue, TArg> => typeof valOrFunction === 'function';

export const resolveValue = <TValue, TArg>(
	valOrFunction: ValueOrFunction<TValue, TArg>,
	arg: TArg,
): TValue => (isFunction(valOrFunction) ? valOrFunction(arg) : valOrFunction);

export interface Toast {
	type: ToastType;
	id: string;
	toasterId?: string;
	message: ValueOrFunction<Renderable, Toast>;
	icon?: Renderable;
	duration?: number;
	pauseDuration: number;
	position?: ToastPosition;
	removeDelay?: number;

	ariaProps: {
		role: 'status' | 'alert';
		'aria-live': 'assertive' | 'off' | 'polite';
	};

	style?: CSSProperties;
	className?: string;
	iconTheme?: IconTheme;

	createdAt: number;
	visible: boolean;
	dismissed: boolean;
	height?: number;
}

export type ToastOptions = Partial<
	Pick<
		Toast,
		| 'id'
		| 'icon'
		| 'duration'
		| 'ariaProps'
		| 'className'
		| 'style'
		| 'position'
		| 'iconTheme'
		| 'toasterId'
		| 'removeDelay'
	>
>;

export type DefaultToastOptions = ToastOptions & {
	[key in ToastType]?: ToastOptions;
};

export interface ToasterProps {
	position?: ToastPosition;
	toastOptions?: DefaultToastOptions;
	reverseOrder?: boolean;
	gutter?: number;
	containerStyle?: CSSProperties;
	containerClassName?: string;
	toasterId?: string;
	children?: (toast: Toast) => ElementDescriptor<any>;
}

export interface ToastWrapperProps {
	id: string;
	className?: string;
	style?: CSSProperties;
	onHeightUpdate: (id: string, height: number) => void;
	children?: OctaneNode;
}
