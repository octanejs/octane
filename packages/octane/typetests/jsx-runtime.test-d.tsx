/** @jsxImportSource octane */
/**
 * Type-level contract of `octane/jsx-runtime` — the React-derived intrinsics
 * with octane's exceptions. Compile-only (tsgo --noEmit); never executed and
 * never imported by runtime code.
 */
import { Fragment, isValidElement, type ElementDescriptor, type FragmentInstance } from 'octane';
import { Fragment as AutomaticRuntimeFragment, type JSX as OctaneJSX } from 'octane/jsx-runtime';
import type * as React from 'react';

declare function use<T>(value: T): void;

// The per-tag IntrinsicElements table is GENERATED from @types/react's — this
// pins full coverage so a React types upgrade that adds tags fails the build
// here instead of silently narrowing octane's JSX surface.
type MissingTags = Exclude<keyof React.JSX.IntrinsicElements, keyof OctaneJSX.IntrinsicElements>;
// When tags are missing this stops being `true` and the error names them.
declare const octaneCoversEveryReactTag: [MissingTags] extends [never] ? true : MissingTags;
use<true>(octaneCoversEveryReactTag);

export function TypeSurface() {
	const cb = (el: HTMLDivElement | null) => {};
	const obj: { current: HTMLDivElement | null } = { current: null };
	const fragmentObject: { current: FragmentInstance | null } = { current: null };
	const fragmentCallback = (instance: FragmentInstance | null) => {};

	return (
		<main>
			{/* ── class / className: clsx-style values ── */}
			<div class="a" />
			<div class={['a', 'b', 0, null, undefined, false]} />
			<div class={{ active: true, hidden: 0 }} />
			<div class={['a', { nested: true }, ['deep', { deeper: 1 }]]} />
			<div className={{ active: true }} />
			{/* @ts-expect-error — symbols are not class values */}
			<div class={Symbol('nope')} />

			{/* ── events: React's names, NATIVE event params ── */}
			<button
				onClick={(event) => {
					use<MouseEvent>(event);
					use<HTMLButtonElement>(event.currentTarget);
				}}
			/>
			<button onDoubleClick={(event) => use<MouseEvent>(event)} />
			<div onMouseDown={(event) => use<MouseEvent>(event)} />
			<div onKeyDown={(event) => use<KeyboardEvent>(event)} />
			<div onClickCapture={(event) => use<MouseEvent>(event)} />
			<input onInput={(event) => use<Event>(event)} />
			{/* @ts-expect-error — handlers are functions, not strings */}
			<button onClick="handleClick()" />
			{/* @ts-expect-error — a click handler cannot demand a KeyboardEvent */}
			<button onClick={(event: KeyboardEvent) => {}} />

			{/* ── refs: callback (with cleanup), object, arrays, nested arrays ── */}
			<div ref={cb} />
			<div
				ref={(el) => {
					use<HTMLDivElement | null>(el);
					return () => {};
				}}
			/>
			<div ref={obj} />
			<div ref={[cb, obj]} />
			<div ref={[[cb], obj]} />
			<div ref={[cb, undefined]} />
			<div ref={[[undefined, cb], obj, null]} />
			{/* @ts-expect-error — optional array entries do not erase a ref's element type */}
			<div ref={[undefined, (el: SVGSVGElement | null) => {}]} />

			{/* ── native `for` and React's htmlFor both work ── */}
			<label for="field" />
			<label htmlFor="field" />

			{/* ── style: string or object form ── */}
			<div style="color: red" />
			<div style={{ color: 'red', paddingTop: 4 }} />
			{/* @ts-expect-error — numbers are not a style value */}
			<div style={42} />

			{/* ── React aliases and native HTML attribute spellings ── */}
			<main tabIndex={-1} />
			<main tabindex={-1} />
			<main tabindex="-1" />
			<main enterkeyhint="send" inputmode="numeric" spellcheck={false} autocorrect="on" />
			<input autocomplete="email" autocapitalize="sentences" readonly maxlength="24" />
			<form novalidate autocomplete="off" />
			<form accept-charset="utf-8" />
			<a referrerpolicy="no-referrer" />
			<img crossorigin="anonymous" />
			<meta http-equiv="refresh" />
			<button popovertarget="details" popovertargetaction="show" />
			<button command="show-modal" commandfor="dialog" />
			<button command={undefined} commandfor={undefined} />
			<button
				formaction={(data) => {
					use<FormData>(data);
				}}
			/>
			<input
				formaction={async (data) => {
					use<FormData>(data);
				}}
			/>
			<table>
				<tbody>
					<tr>
						<td colspan="2" rowspan={2} />
					</tr>
				</tbody>
			</table>
			<svg hidden tabindex="0" viewBox="0 0 10 10" />
			<svg tabindex={-1} strokeWidth={2} />
			{/* @ts-expect-error — numeric HTML attributes reject nonnumeric text */}
			<main tabindex="first" />
			{/* @ts-expect-error — lowercase aliases preserve their enumerated values */}
			<button popovertargetaction="expand" />
			{/* @ts-expect-error — lowercase aliases preserve enter-key-hint tokens */}
			<main enterkeyhint={String('send')} />
			{/* @ts-expect-error — lowercase aliases preserve input-mode tokens */}
			<main inputmode="latin" />
			{/* @ts-expect-error — spellcheck accepts booleans and boolean strings only */}
			<main spellcheck="perhaps" />
			{/* @ts-expect-error — lowercase aliases preserve referrer-policy values */}
			<a referrerpolicy="always" />
			{/* @ts-expect-error — command invoker attributes belong to buttons */}
			<div command="show-modal" />
			{/* @ts-expect-error — SVG attribute names remain case sensitive */}
			<svg viewbox="0 0 10 10" />
			{/* @ts-expect-error — autoFocus is a mount action, not a native boolean attribute */}
			<input autofocus />
			{/* @ts-expect-error — controlled defaults are React/Octane props, not attributes */}
			<input defaultvalue="value" />
			{/* @ts-expect-error — controlled defaults are React/Octane props, not attributes */}
			<input defaultchecked />
			{/* @ts-expect-error — warning hints are framework props, not attributes */}
			<div suppresshydrationwarning />
			{/* @ts-expect-error — native delegated events keep their onClick spelling */}
			<button onclick={() => {}} />
			{/* @ts-expect-error — htmlFor's native spelling is `for`, never `htmlfor` */}
			<label htmlfor="field" />
			{/* @ts-expect-error — acceptCharset's native spelling is `accept-charset` */}
			<form acceptcharset="utf-8" />
			{/* @ts-expect-error — httpEquiv's native spelling is `http-equiv` */}
			<meta httpequiv="refresh" />
			<button aria-pressed="mixed" />
			<input aria-checked={true} />
			{/* @ts-expect-error — ARIA token unions must reject widened arbitrary strings */}
			<button aria-pressed={String(true)} />
			{/* @ts-expect-error — ARIA token unions must reject widened arbitrary strings */}
			<input aria-checked={String(false)} />
			<div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} suppressHydrationWarning />
			<input defaultValue="a" defaultChecked />
			<div data-testid="anything" aria-hidden="true" />
			<svg>
				<foreignObject>
					<div xmlns="http://www.w3.org/1999/xhtml" />
				</foreignObject>
			</svg>
			{/* @ts-expect-error — namespace declarations are string attributes */}
			<div xmlns={42} />

			{/* ── children are renderables (unknown) ── */}
			<div>{123}</div>
			<div>{null}</div>

			{/* ── Fragment: children, key, and fragment refs ── */}
			<Fragment
				ref={(instance) => {
					use<FragmentInstance | null>(instance);
					instance?.focus();
					instance?.focusLast({ preventScroll: true });
					instance?.getRootNode({ composed: true });
					instance?.scrollIntoView(false);
				}}
			>
				<span />
			</Fragment>
			<Fragment ref={fragmentObject} />
			<Fragment ref={[fragmentObject, fragmentCallback]} />
			<AutomaticRuntimeFragment
				ref={(instance) => {
					use<FragmentInstance | null>(instance);
					instance?.focus();
				}}
			/>
			{/* @ts-expect-error — fragment refs receive an instance, not an element */}
			<Fragment ref={(instance: HTMLDivElement | null) => {}} />
		</main>
	);
}

declare const fragmentInstance: FragmentInstance;
// @ts-expect-error — fragment scrolling accepts only its boolean alignment argument.
fragmentInstance.scrollIntoView({ block: 'center' });

// ── Elements are not promises — the poisoned protocol holds octane-side too ──
// `Octane.JSX.Element`'s `Promise<React.ReactNode>` parent exists only for the
// React 19 tag gate (see jsx-runtime.d.ts); consuming an element as a promise
// is a hard type error inside octane-JSX programs as well.
declare const someElement: OctaneJSX.Element;
export async function elementAwaitRejected() {
	// @ts-expect-error — TS1320: an octane element is not a valid promise
	await someElement;
}
// @ts-expect-error — .then with a callback fails overload resolution
export const elementThenRejected = someElement.then(() => null);

// Element inspection preserves known prop types and can identify the element
// alternative in a generic element-or-props union without widening either arm.
export function propsFromElementOrObject<P extends object>(
	option: ElementDescriptor<Partial<P>> | Partial<P>,
): Partial<P> {
	if (isValidElement<Partial<P>>(option)) return option.props;
	return option;
}

declare const namedElement: ElementDescriptor<{ label: string }> | null;
if (isValidElement(namedElement)) {
	use<string>(namedElement.props.label);
	// @ts-expect-error — the guard must not erase known props to any.
	use(namedElement.props.missing);
}

declare const elementUnion:
	ElementDescriptor<{ label: string }> | ElementDescriptor<{ count: number }> | null | undefined;
if (isValidElement(elementUnion)) {
	use<{ label: string } | { count: number }>(elementUnion.props);
	// @ts-expect-error — recognizing a descriptor union must not erase its props to any.
	use(elementUnion.props.missing);
} else {
	use<null | undefined>(elementUnion);
}

declare const opaqueElement: ElementDescriptor<unknown>;
if (isValidElement(opaqueElement)) {
	// @ts-expect-error — recognizing an element does not validate unknown props.
	use(opaqueElement.props.label);
}
