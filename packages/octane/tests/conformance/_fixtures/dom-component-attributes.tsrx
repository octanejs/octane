// Fixtures for dom-component-attributes.test.ts — ports of ReactDOMComponent-test.js
// attribute add/remove/change-on-rerender behaviors, the delete-then-add ordering
// outcomes, mutation minimization, and the custom-attribute matrix.

// height add/remove on an <img> (attribute removal).
export function ImgHeight(props) @{
	<img id="ih" height={props.h} />
}

// src / data-foo null-vs-undefined matrix + empty-src behavior on an <img>.
export function ImgSrc(props) @{
	<img id="is" src={props.src} data-foo={props.foo} />
}

// className removal ("should remove properties").
export function ClassedDiv(props) @{
	<div id="cd" class={props.cls} />
}

// empty href on <a> (allowed in React, unlike <link href="">).
export function AnchorHref(props) @{
	<a id="ah" href={props.href}>{'x'}</a>
}

// empty href on <link> (React refuses to write it). NOTE: octane hoists <link>
// into document.head — the test asserts against the hoisted element.
export function LinkHref(props) @{
	<link href={props.href} />
}

// empty action on <form>.
export function FormAction(props) @{
	<form id="fa" action={props.a} />
}

// formAction="" on a <button> overriding the parent form's action.
export function FormButton(props) @{
	<form action="hello">
		<button id="fb" formAction={props.fa} />
	</form>
}

// React-specific HTML alias: React maps acceptCharset → `accept-charset`;
// octane writes names as authored (intentional divergence, no alias table).
export function FormAcceptCharset(props) @{
	<form id="fac" acceptCharset={props.v} />
}

// The supported TSRX idiom: the NATIVE hyphenated attribute name.
export function FormAcceptCharsetNative(props) @{
	<form id="facn" accept-charset={props.v} />
}

// React-specific SVG alias: arabicForm should land as `arabic-form`.
export function SvgArabicForm(props) @{
	<svg id="saf" arabicForm={props.v} />
}

// id add/change/remove — DOM mutation minimization (setAttribute spy).
export function DivId(props) @{
	<div id={props.id} />
}

// `value` on a plain <div> is a custom attribute — string-property dedup.
export function DivValue(props) @{
	<div id="dv" value={props.v} />
}

// muted boolean on <audio> — React writes the DOM PROPERTY; octane the attribute.
export function AudioMuted(props) @{
	<audio id="am" muted={props.m} data-unrelated={props.u} />
}

// Elements with an `is` attribute keep arbitrary attributes.
export function ButtonIs() @{
	<button id="bi" is="test" cowabunga="chevynova" />
}

// dir null/undefined switching must not touch the DOM.
export function DivDir(props) @{
	<div id="dd" dir={props.dir} />
}

// spellCheck is an ENUMERATED DOM attribute in React (true→"true", false→"false").
export function SpellCheck(props) @{
	<div id="sc" spellCheck={props.v} />
}

// Generic unknown/custom attribute value matrix (string/number/bool/object/fn/NaN).
export function DivWhatever(props) @{
	<div id="dw" whatever={props.w} />
}

// Cased custom + data attributes (HTML setAttribute lowercases both).
export function CasedAttrs(props) @{
	<div id="ca" data-fooBar={props.d} fooBar={props.f} />
}

// Bare spread on a regular element — attribute-name injection port drives evil keys.
export function DivBareSpread(props) @{
	<div {...props.sp} />
}

// Bare spread on a custom element — same, custom-element arm.
export function CustomBareSpread(props) @{
	<x-foo-component {...props.sp} />
}
