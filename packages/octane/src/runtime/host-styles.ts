// CSS scalar normalization and prepared DOM writes, shared by the renderer's owned style paths.
declare const process: { env: { NODE_ENV?: string } };

import { styleName, devWarnStyleProperty, devWarnStyleCoercion } from '../css.js';
import { cssStyleValue } from '../constants.js';

// ---------------------------------------------------------------------------
// Style — object form (keys may be kebab-case `font-size` OR React-style
// camelCase `fontSize`; see styleName) or a full cssText string. `prev` is the
// previous value tracked by the compiler so we can diff object→object and only
// touch the properties that changed.
// ---------------------------------------------------------------------------

const IMPORTANT_SUFFIX = '!important';

export function applyStyleValue(
	el: HTMLElement | SVGElement,
	style: CSSStyleDeclaration,
	value: any,
	prev: any,
	prepared = false,
): void {
	if (value == null || value === false || value === '') {
		if (prev && typeof prev === 'object') {
			for (const key in prev) style.removeProperty(styleName(key));
		} else if (typeof prev === 'string') {
			style.cssText = '';
		}
		return;
	}

	if (typeof value === 'string') {
		if (prev !== value) style.cssText = value;
		return;
	}

	// Object form. If prev is an object too, diff per-property — only changed
	// keys are touched. Otherwise (prev was string / null) reset cssText first
	// so leftover declarations don't leak across the transition.
	if (prev && typeof prev === 'object') {
		for (const k in prev) {
			if (!(k in value)) style.removeProperty(styleName(k));
		}
		for (const k in value) {
			const v = value[k];
			if (v === prev[k]) continue;
			// Booleans clear the property (React parity): `fontFamily: true` must not
			// set the literal string "true" (a valid font name!).
			if (v == null || typeof v === 'boolean') style.removeProperty(styleName(k));
			else if (prepared) applyPreparedStyleProperty(style, k, v);
			else applyStyleProperty(el, style, k, v);
		}
	} else {
		if (typeof prev === 'string') style.cssText = '';
		for (const k in value) {
			const v = value[k];
			if (v != null && typeof v !== 'boolean') {
				if (prepared) applyPreparedStyleProperty(style, k, v);
				else applyStyleProperty(el, style, k, v);
			}
		}
	}
}

export function applyStyleProperty(
	el: HTMLElement | SVGElement,
	style: CSSStyleDeclaration,
	name: string,
	value: any,
): void {
	applyPreparedStyleProperty(style, name, coerceStyleProperty(el, name, value));
}

export function coerceStyleProperty(
	el: HTMLElement | SVGElement,
	name: string,
	value: unknown,
): string {
	// React parity: a bare number gets `px` unless it's 0, a custom prop, or unitless.
	let s: string;
	if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
		devWarnStyleProperty(name, value, false);
		try {
			s = cssStyleValue(name, value);
		} catch (error) {
			devWarnStyleCoercion(name, value);
			throw error;
		}
	} else {
		s = cssStyleValue(name, value);
	}
	return s;
}

export function applyPreparedStyleProperty(
	style: CSSStyleDeclaration,
	name: string,
	s: string,
): void {
	const prop = styleName(name);
	// CodeQL flagged the prior `/\s*!important\s*$/` test+replace combo as
	// polynomial-regex-on-uncontrolled-input. Same job in linear time using
	// built-in trimEnd() + endsWith() — no regex, no backtracking risk.
	const tail = s.trimEnd();
	if (tail.endsWith(IMPORTANT_SUFFIX)) {
		style.setProperty(
			prop,
			tail.slice(0, tail.length - IMPORTANT_SUFFIX.length).trimEnd(),
			'important',
		);
	} else {
		style.setProperty(prop, s);
	}
}
