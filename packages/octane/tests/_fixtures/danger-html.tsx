import { createElement, useState } from 'octane';

// React-style `dangerouslySetInnerHTML={{__html}}` — the only supported raw-HTML
// prop (bare `innerHTML` is NOT special-cased anymore).

let _set: ((h: string) => void) | null = null;
export function setHtml(h: string) {
	if (_set) _set(h);
}

let _setChild: ((v: unknown) => void) | null = null;
export function setDangerChild(v: unknown) {
	if (_setChild) _setChild(v);
}

// Fast path: only child, no spread → htmlOnlyChild assignment (with update diff).
export function DangerHtml(props: { html: string }) {
	const [html, set] = useState(props.html);
	_set = set;
	return <div id="d" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Bare `innerHTML` must NOT be treated as raw HTML — it's a plain (dead) attribute.
export function BareInnerHtml(props: { html: string }) {
	return <div id="b" innerHTML={props.html} />;
}

// Spread CARRYING dangerouslySetInnerHTML → setSpread → setAttribute's danger path.
export function SpreadDanger(props: { attrs: Record<string, unknown> }) {
	return <div id="s" {...props.attrs} />;
}

// A compiled host carrying BOTH a spread and a dynamic child hole. Only the
// spread can supply dangerouslySetInnerHTML here, so the compiler cannot reject
// the pairing and the raw HTML wins the element at runtime — the hole must then
// refuse to reconcile a non-nullish child into content it does not own, and
// accept a nullish one without erasing the HTML.
export function SpreadDangerPlusHole(props: { attrs: Record<string, unknown>; child: unknown }) {
	const [child, set] = useState(props.child);
	_setChild = set as (v: unknown) => void;
	return (
		<div id="sdh" {...props.attrs}>
			{child}
		</div>
	);
}

// De-opt host path: a component RETURNING createElement(tag, {dangerouslySetInnerHTML})
// routes through hostElementBody/applyDeoptProps — the raw HTML must own the element's
// content (child reconciliation would otherwise wipe the innerHTML the props just set).
function DeoptDangerInner(props: { html: string }) {
	return createElement('style', { id: 'dd', dangerouslySetInnerHTML: { __html: props.html } });
}
export function DeoptDanger(props: { html: string }) {
	const [html, set] = useState(props.html);
	_set = set;
	return <div id="host">{createElement(DeoptDangerInner, { html })}</div>;
}
