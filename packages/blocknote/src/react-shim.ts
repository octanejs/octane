import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type { OctaneNode as ReactNode, OctaneNode };

export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['div']['style'],
	string | undefined
>;

export type RefObject<T> = { current: T | null };
export type Ref<T> = Octane.Ref<T>;
export type RefAttributes<T> = { ref?: Ref<T> };
export type PropsWithoutRef<P> = P;

export type FC<P = Record<string, unknown>> = (props: P) => OctaneNode;
export type ComponentType<P = Record<string, unknown>> = FC<P>;

export type HTMLAttributes<T extends Element = Element> = Partial<{
	id: string;
	class: string;
	className: string;
	style: CSSProperties;
	role: string;
	tabIndex: number;
	'aria-label': string;
	'aria-hidden': boolean | 'true' | 'false';
	onClick: (event: MouseEvent) => void;
	onContextMenu: (event: MouseEvent) => void;
	onKeyDown: (event: KeyboardEvent) => void;
	onFocus: (event: FocusEvent) => void;
	onBlur: (event: FocusEvent) => void;
}>;

export type DOMAttributes<T extends Element = Element> = HTMLAttributes<T>;
export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type ForwardedRef<T> = Ref<T>;

export namespace Octane {
	export namespace JSX {
		export type Element = OctaneNode;
	}
}
