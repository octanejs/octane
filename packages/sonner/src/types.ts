import type { ElementDescriptor } from 'octane';

// Octane renderable holes accept descriptors, primitives, arrays and nullish
// values. Keep this deliberately broad: it is the Sonner-facing equivalent of
// ReactNode, while ElementDescriptor gives custom() its upstream element-only
// return contract.
export type ToastContent = any;
export type ToastElement = ElementDescriptor<any>;
export type CSSProperties = Record<string, any>;
export type StateSetter<T> = (value: T | ((previous: T) => T)) => void;
export type Ref<T> = ((value: T | null) => void) | { current: T | null } | null;

export type ToastTypes =
	| 'normal'
	| 'action'
	| 'success'
	| 'info'
	| 'warning'
	| 'error'
	| 'loading'
	| 'default';

export type PromiseT<Data = any> = Promise<Data> | (() => Promise<Data>);

export interface PromiseIExtendedResult extends ExternalToast {
	message: ToastContent;
}

export type PromiseTExtendedResult<Data = any> =
	| PromiseIExtendedResult
	| ((data: Data) => PromiseIExtendedResult | Promise<PromiseIExtendedResult>);

export type PromiseTResult<Data = any> =
	| string
	| ToastContent
	| ((data: Data) => ToastContent | string | Promise<ToastContent | string>);

export type PromiseExternalToast = Omit<ExternalToast, 'description'>;

export type PromiseData<ToastData = any> = PromiseExternalToast & {
	loading?: string | ToastContent;
	success?: PromiseTResult<ToastData> | PromiseTExtendedResult<ToastData>;
	error?: PromiseTResult | PromiseTExtendedResult;
	description?: PromiseTResult;
	finally?: () => void | Promise<void>;
};

export interface ToastClassnames {
	toast?: string;
	title?: string;
	description?: string;
	loader?: string;
	closeButton?: string;
	cancelButton?: string;
	actionButton?: string;
	success?: string;
	error?: string;
	info?: string;
	warning?: string;
	loading?: string;
	default?: string;
	content?: string;
	icon?: string;
}

export interface ToastIcons {
	success?: ToastContent;
	info?: ToastContent;
	warning?: ToastContent;
	error?: ToastContent;
	loading?: ToastContent;
	close?: ToastContent;
}

export type ActionEvent = MouseEvent & { currentTarget: HTMLButtonElement };

export interface Action {
	label: ToastContent;
	onClick: (event: ActionEvent) => void;
	actionButtonStyle?: CSSProperties;
}

export interface ToastT {
	id: number | string;
	toasterId?: string;
	title?: (() => ToastContent) | ToastContent;
	type?: ToastTypes;
	icon?: ToastContent;
	jsx?: ToastContent;
	richColors?: boolean;
	invert?: boolean;
	closeButton?: boolean;
	dismissible?: boolean;
	description?: (() => ToastContent) | ToastContent;
	duration?: number;
	delete?: boolean;
	action?: Action | ToastContent;
	cancel?: Action | ToastContent;
	onDismiss?: (toast: ToastT) => void;
	onAutoClose?: (toast: ToastT) => void;
	promise?: PromiseT;
	cancelButtonStyle?: CSSProperties;
	actionButtonStyle?: CSSProperties;
	style?: CSSProperties;
	unstyled?: boolean;
	className?: string;
	classNames?: ToastClassnames;
	descriptionClassName?: string;
	position?: Position;
	testId?: string;
}

export function isAction(action: Action | ToastContent): action is Action {
	return (action as Action).label !== undefined;
}

export type Position =
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right'
	| 'top-center'
	| 'bottom-center';

export interface HeightT {
	height: number;
	toastId: number | string;
	position: Position | undefined;
}

interface ToastOptions {
	className?: string;
	closeButton?: boolean;
	descriptionClassName?: string;
	style?: CSSProperties;
	cancelButtonStyle?: CSSProperties;
	actionButtonStyle?: CSSProperties;
	duration?: number;
	unstyled?: boolean;
	classNames?: ToastClassnames;
	closeButtonAriaLabel?: string;
	toasterId?: string;
}

type Offset =
	| {
			top?: string | number;
			right?: string | number;
			bottom?: string | number;
			left?: string | number;
	  }
	| string
	| number;

export interface ToasterProps {
	id?: string;
	invert?: boolean;
	theme?: 'light' | 'dark' | 'system';
	position?: Position;
	hotkey?: string[];
	richColors?: boolean;
	expand?: boolean;
	duration?: number;
	gap?: number;
	visibleToasts?: number;
	closeButton?: boolean;
	toastOptions?: ToastOptions;
	className?: string;
	style?: CSSProperties;
	offset?: Offset;
	mobileOffset?: Offset;
	dir?: 'rtl' | 'ltr' | 'auto';
	swipeDirections?: SwipeDirection[];
	icons?: ToastIcons;
	containerAriaLabel?: string;
	ref?: Ref<HTMLElement>;
}

export type SwipeDirection = 'top' | 'right' | 'bottom' | 'left';

export interface ToastProps {
	toast: ToastT;
	toasts: ToastT[];
	index: number;
	swipeDirections?: SwipeDirection[];
	expanded: boolean;
	invert: boolean | undefined;
	heights: HeightT[];
	setHeights: StateSetter<HeightT[]>;
	removeToast: (toast: ToastT) => void;
	gap: number;
	position: Position;
	visibleToasts: number;
	expandByDefault: boolean | undefined;
	closeButton: boolean | undefined;
	interacting: boolean;
	style?: CSSProperties;
	cancelButtonStyle?: CSSProperties;
	actionButtonStyle?: CSSProperties;
	duration?: number;
	className?: string;
	unstyled?: boolean;
	descriptionClassName?: string;
	classNames?: ToastClassnames;
	icons?: ToastIcons;
	closeButtonAriaLabel?: string;
	defaultRichColors?: boolean;
}

export enum SwipeStateTypes {
	SwipedOut = 'SwipedOut',
	SwipedBack = 'SwipedBack',
	NotSwiped = 'NotSwiped',
}

export type Theme = 'light' | 'dark';

export interface ToastToDismiss {
	id: number | string;
	dismiss: boolean;
}

export type ExternalToast = Omit<ToastT, 'id' | 'type' | 'title' | 'jsx' | 'delete' | 'promise'> & {
	id?: number | string;
	toasterId?: string;
};
