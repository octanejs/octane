import { createElement, useState } from 'octane';

// React-style `dangerouslySetInnerHTML={{__html}}` — the only supported raw-HTML
// prop (bare `innerHTML` is NOT special-cased anymore).

let _set: ((h: string) => void) | null = null;
export function setHtml(h: string) {
	if (_set) _set(h);
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
