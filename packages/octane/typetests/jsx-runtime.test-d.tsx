/** @jsxImportSource octane */
/**
 * Type-level contract of `octane/jsx-runtime` — the React-derived intrinsics
 * with octane's exceptions. Compile-only (tsgo --noEmit); never executed and
 * never imported by runtime code.
 */
import { Fragment } from 'octane';
import type { JSX as OctaneJSX } from 'octane/jsx-runtime';
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

			{/* ── native `for` and React's htmlFor both work ── */}
			<label for="field" />
			<label htmlFor="field" />

			{/* ── style: string or object form ── */}
			<div style="color: red" />
			<div style={{ color: 'red', paddingTop: 4 }} />
			{/* @ts-expect-error — numbers are not a style value */}
			<div style={42} />

			{/* ── React-shaped attribute surface ── */}
			<main tabIndex={-1} />
			{/* @ts-expect-error — lowercase `tabindex` is not the typed surface */}
			<main tabindex={-1} />
			<div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} suppressHydrationWarning />
			<input defaultValue="a" defaultChecked />
			<div data-testid="anything" aria-hidden="true" />

			{/* ── children are renderables (unknown) ── */}
			<div>{123}</div>
			<div>{null}</div>

			{/* ── Fragment: children, key, and fragment refs ── */}
			<Fragment ref={(instance) => {}}>
				<span />
			</Fragment>
		</main>
	);
}
