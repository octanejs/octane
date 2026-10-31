/** @jsxImportSource octane */
// Under `exactOptionalPropertyTypes`, an optional prop accepts an explicit
// `undefined` only when its type says so. @types/react writes every optional DOM
// prop as `prop?: T | undefined`, so Octane's host and built-in props must too.
import type { JSX } from 'octane/jsx-runtime';
import type { JSX as StrongJSX } from 'octane/strong/jsx-runtime';
import type * as Strong from 'octane/strong';
import {
	Activity,
	ErrorBoundary,
	Fragment,
	ViewTransition,
	type ComponentProps,
	type CSSProperties,
	type FragmentProps,
	type HTMLProps,
	type JSX as PublicJSX,
	type SignalCSSProperties,
	type SVGProps,
	type ViewTransitionProps,
} from 'octane';
import type { ReactCompatProps } from 'octane/react';
import { Activity as ServerActivity, ViewTransition as ServerViewTransition } from 'octane/server';

/** The optional keys of `P` whose type rejects an explicit `undefined`. */
type RejectsUndefined<P> = {
	[K in keyof P]-?: { [Q in K]: undefined } extends Pick<P, K> ? never : K;
}[keyof P];
/** `tag.prop` for every intrinsic element prop that rejects an explicit `undefined`. */
type IntrinsicRejects<E> = {
	[T in keyof E]: `${T & string}.${RejectsUndefined<E[T]> & string}`;
}[keyof E];
type None<T extends never> = T;

// Every DOM, SVG and ARIA attribute, event handler, and Octane addition on every tag.
type _compat = None<IntrinsicRejects<JSX.IntrinsicElements>>;
type _public = None<IntrinsicRejects<PublicJSX.IntrinsicElements>>;
type _strong = None<IntrinsicRejects<StrongJSX.IntrinsicElements>>;
type _htmlProps = None<RejectsUndefined<HTMLProps<HTMLDivElement>>>;
type _svgProps = None<RejectsUndefined<SVGProps<SVGSVGElement>>>;
type _strongDiv = None<RejectsUndefined<Strong.ComponentProps<'div'>>>;
type _strongSvg = None<RejectsUndefined<Strong.SVGProps<SVGSVGElement>>>;
type _css = None<RejectsUndefined<CSSProperties>>;
type _signalCss = None<RejectsUndefined<SignalCSSProperties>>;

// React-shaped built-in components.
type _activity = None<RejectsUndefined<ComponentProps<typeof Activity>>>;
type _serverActivity = None<RejectsUndefined<ComponentProps<typeof ServerActivity>>>;
type _viewTransition = None<RejectsUndefined<ViewTransitionProps>>;
type _serverViewTransition = None<RejectsUndefined<Parameters<typeof ServerViewTransition>[0]>>;
type _fragment = None<RejectsUndefined<FragmentProps>>;
type _jsxFragment = None<
	RejectsUndefined<Parameters<typeof import('octane/jsx-runtime').Fragment>[0]>
>;
type _errorBoundary = None<RejectsUndefined<Parameters<typeof ErrorBoundary>[0]>>;
type _reactCompat = None<Exclude<RejectsUndefined<ReactCompatProps>, 'component' | 'props'>>;

// The consumer shape that failed with TS2375: a conditional value at a JSX site.
declare const open: boolean;
declare const label: string | undefined;
declare const onClick: ((event: MouseEvent) => void) | undefined;

const host = (
	<div
		style={open ? { height: 10 } : undefined}
		class={open ? 'open' : undefined}
		for={undefined}
		onClick={onClick}
		onInput={open ? () => {} : undefined}
		onCancel={undefined}
		aria-label={label}
		tabindex={undefined}
		ref={undefined}
	>
		{'x' as string}
	</div>
);
const svg = (
	<svg xmlns={undefined} style={undefined} viewBox={label}>
		<path d={label} onPointerDown={undefined} />
	</svg>
);
const builtIns = (
	<Fragment ref={undefined}>
		<Activity mode={open ? 'hidden' : undefined} name={label}>
			<ViewTransition name={label} enter={undefined} onEnter={undefined}>
				{host}
			</ViewTransition>
		</Activity>
	</Fragment>
);

// Accepting `undefined` widens nothing else.
// @ts-expect-error A style is still a string or a style object.
const badStyle = <div style={42} />;
// @ts-expect-error A handler still receives the native event it is bound to.
const badHandler = <div onClick={(event: KeyboardEvent) => event.key} />;
// @ts-expect-error Activity modes are still 'visible' or 'hidden'.
const badMode = <Activity mode="paused">{svg}</Activity>;

export { host, svg, builtIns, badStyle, badHandler, badMode };
