import { useState } from 'octane';

// clsx-style `class` / `className` composition. Octane composes a class value from
// strings, numbers, arrays, objects, and any nesting of those (falsy parts drop out) —
// matching the `clsx` / `classnames` packages. This is an INTENTIONAL divergence from
// React, which coerces `className={['a','b']}` to the string "a,b".

// Array — falsy entries (`false`, `0`, `null`, `undefined`, `''`) drop out.
export function ArrayClass(props) @{
	<div class={['a', props.on && 'b', 'c']}>{'x'}</div>
}

// Object — keys whose values are truthy are included, in insertion order.
export function ObjectClass(props) @{
	<div class={{ active: props.active, disabled: props.disabled }}>{'x'}</div>
}

// Nested mix: string + object + nested array.
export function NestedClass(props) @{
	<div class={['btn', { active: props.active }, [props.size, 'end']]}>{'x'}</div>
}

// `className` (the React alias) composes identically to `class`.
export function ClassNameArray(props) @{
	<div className={['x', props.y && 'y']}>{'x'}</div>
}

// Spread-supplied class value goes through setSpread.
export function SpreadClass(props) @{
	<div {...props}>{'x'}</div>
}

// A later spread owns the final class value when it supplies either `class` or
// `className`. The class value itself still uses octane's clsx-style composition.
export function ExplicitThenSpreadClass(props) @{
	<a href={props.href} class="story-title" {...props.attrs}>{'x'}</a>
}

// A later explicit class owns the final value when an earlier spread supplies class.
// Hydration must not replay the spread's intermediate class onto the adopted node.
export function SpreadThenExplicitClass(props) @{
	<div {...props.attrs} class={props.cls}>{'x'}</div>
}

// Class ownership follows authored order across any number of spreads. Non-class
// attributes retain their authored serialization positions.
export function MultipleClassSpreads(props) @{
	<div class={props.base} {...props.first} data-own="own" {...props.second}>{'x'}</div>
}

// SVGElement.className is a read-only SVGAnimatedString, so the compiler routes this
// through setAttribute('class', normalizeClass(...)).
export function SvgClass(props) @{
	<svg class={['a', props.on && 'b']}></svg>
}

// Toggling a class across renders (update path — a fresh array each render).
export function Toggling() @{
	const [on, setOn] = useState(false);
	<button id="btn" onClick={() => setOn(!on)} class={['btn', on && 'on']}>{'x'}</button>
}

// Scoped component (has a <style> block) with an array class — exercises the pre-pass
// that normalizes the value BEFORE the scope hash is appended, so the composed classes
// and the hash both land in the final `class`.
export function ScopedArray(props) @{
	<div class={['a', props.on && 'b']}>
		{'x'}
		<style>
			.a {
				color: rgb(1, 2, 3);
			}
		</style>
	</div>
}

// Scoped component with a nullish class — must render just the hash, never the literal
// string "undefined" (the pre-normalization fixes the old `${undefined} <hash>` bug).
export function ScopedNullish(props) @{
	<div class={props.cls}>
		{'x'}
		<style>
			.z {
				color: rgb(4, 5, 6);
			}
		</style>
	</div>
}
