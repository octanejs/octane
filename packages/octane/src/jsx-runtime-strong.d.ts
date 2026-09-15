/** Strong mode's DOM JSX contract; component props keep their authored types. */
import type { JSX as CompatibilityJSX } from './jsx-runtime.js';
import type { TrustedHTML } from './trusted-html.js';

export { Fragment, jsx, jsxs, jsxDEV } from './jsx-runtime.js';
export type {
	ClassValue,
	CSSProperties,
	SignalCSSProperties,
	OctaneElement,
} from './jsx-runtime.js';

type StrongIntrinsicProps<P> = Omit<
	P,
	'dangerouslySetInnerHTML' | 'suppressHydrationWarning' | 'suppressNativeChangeWarning'
> & {
	dangerouslySetInnerHTML?: TrustedHTML | null | undefined;
	suppressHydrationWarning?: never;
	suppressNativeChangeWarning?: never;
};

export namespace JSX {
	export type Element = CompatibilityJSX.Element;
	export type ElementType = CompatibilityJSX.ElementType;
	export type ElementChildrenAttribute = CompatibilityJSX.ElementChildrenAttribute;
	export type IntrinsicAttributes = CompatibilityJSX.IntrinsicAttributes;
	export type IntrinsicClassAttributes<T> = CompatibilityJSX.IntrinsicClassAttributes<T>;
	export type IntrinsicElements = {
		[K in keyof CompatibilityJSX.IntrinsicElements]: StrongIntrinsicProps<
			CompatibilityJSX.IntrinsicElements[K]
		>;
	};
}
