import type { Octane } from 'octane/jsx-runtime';

export type ComponentProps<Tag extends keyof Octane.JSX.IntrinsicElements> =
	Octane.JSX.IntrinsicElements[Tag];

export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['div']['style'],
	string | undefined
>;

export type DetailedHTMLProps<E, T> = Octane.DetailedHTMLProps<E, T>;
export type HTMLAttributes<T> = Octane.HTMLAttributes<T>;
export type ImgHTMLAttributes<T> = Octane.ImgHTMLAttributes<T>;
export type SVGProps<T> = Octane.SVGProps<T>;

export type NativeMouseEvent<T extends Element> = globalThis.MouseEvent & {
	currentTarget: T;
};

export type NativePointerEvent<T extends Element> = globalThis.PointerEvent & {
	currentTarget: T;
};

export type NativeEventHandler<T extends Element> = (event: Event & { currentTarget: T }) => void;
