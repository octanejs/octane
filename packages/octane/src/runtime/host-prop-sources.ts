// Snapshot, merge and normalize host prop sources before a render is accepted. Admission and DOM publication belong to the renderer.
declare const process: { env: { NODE_ENV?: string } };

import { formActionAttributeName, isHtmlCustomElement } from '../runtime/host-attributes.js';
import { ATTRIBUTE_ALIASES } from '../constants.js';
import { mergeClass } from '../css.js';
import type { PreparedHostProps, HostPropSource, HostPropWriter } from '../runtime.js';

// ---------------------------------------------------------------------------
// Spread attributes — `<div {...props}/>`. Iterates the spread object, routes
// each key to the appropriate setter (class / style / onXxx / attr / ref) and
// diffs against the previous spread object so keys that vanished get cleared.
// React 19 shape; only `key`, `ref`, `children` are special-cased.
// ---------------------------------------------------------------------------

export function isEventKey(k: string): boolean {
	const c = k.charCodeAt(2);
	return (
		k.length > 2 &&
		k.charCodeAt(0) === 111 /*o*/ &&
		k.charCodeAt(1) === 110 /*n*/ &&
		c >= 65 /*A*/ &&
		c <= 90 /*Z*/
	);
}

/** Snapshot a JSX spread with own-enumerable Object.assign semantics. */
export function snapshotSpread(value: unknown): Record<string, unknown> | null {
	if (value == null) return null;
	const source = Object(value) as Record<PropertyKey, unknown>;
	const snapshot: Record<string, unknown> = Object.create(null);
	for (const key of Reflect.ownKeys(source)) {
		if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
		const next = source[key];
		// JSX spread evaluates enumerable symbol getters, but DOM prop routing has
		// no symbol-key surface. Preserve the observable read and discard the key.
		if (typeof key === 'string') snapshot[key] = next;
	}
	return snapshot;
}

export function isHostPropIdentityKey(name: string): boolean {
	if (
		name === 'ref' ||
		name === 'children' ||
		name === 'dangerouslySetInnerHTML' ||
		name === 'suppressHydrationWarning' ||
		name === 'suppressContentEditableWarning' ||
		name === 'suppressNativeChangeWarning' ||
		name === '__octaneNativeChangeDiagnostic' ||
		name === 'autoFocus' ||
		name === 'value' ||
		name === 'defaultValue' ||
		name === 'checked' ||
		name === 'defaultChecked' ||
		name === 'multiple'
	)
		return true;
	return isEventKey(name);
}

function normalizedHostProp(el: Element, rawName: string): string {
	if (rawName === 'class' || rawName === 'className') return 'class';
	const actionName = formActionAttributeName(el, rawName);
	if (actionName !== null) return actionName;
	return isHtmlCustomElement(el) ? rawName : (ATTRIBUTE_ALIASES.get(rawName) ?? rawName);
}

export function hasEarlierPreparedAttributeAlias(
	el: Element,
	prepared: PreparedHostProps,
	name: string,
): boolean {
	const channel = normalizedHostProp(el, name);
	// These keys and their values were captured during prepare. Only an earlier
	// attribute writer can make an unchanged null winner necessary at commit.
	for (const prior in prepared.attributes) {
		if (prior === name) return false;
		if (normalizedHostProp(el, prior) === channel) return true;
	}
	return false;
}

/**
 * Resolve a spread-bearing compiled host's complete prop set before touching
 * the DOM. JSX spread merging is last-writer-wins, but aliases such as
 * className/class, htmlFor/for, and xlinkHref/xlink:href target one native
 * property. Canonical identities ensure a vanished earlier source cannot
 * remove an unchanged later winner, and hydration compares only the final
 * client value against the final server value.
 *
 * A synthesized scope-hash class (4th tuple flag) is not an authored later
 * writer: after identity last-writer-wins, it composes onto the winning class
 * instead of replacing a spread's class. An authored `class` beside a spread
 * stays last-writer-wins because its hash is baked into that authored value
 * and carries no merge flag.
 */
export function resolveHostPropSources(
	el: Element,
	sources: readonly HostPropSource[],
	props: Map<string, HostPropWriter>,
	readStyle: ((value: unknown) => unknown) | undefined,
): Record<string, unknown> {
	let classMerges: Array<{ rawName: string; value: unknown; order: number }> | null = null;
	let sourceOrder = 0;
	function record(rawName: unknown, value: unknown): void {
		if (typeof rawName !== 'string') return;
		const order = sourceOrder++;
		const previous = props.get(rawName);
		if (previous !== undefined) {
			previous.value = value;
			previous.lastOrder = order;
		} else {
			props.set(rawName, { name: rawName, value, firstOrder: order, lastOrder: order });
		}
	}

	for (const source of sources) {
		if (!source[0]) {
			const rawName = source[1];
			if (
				source[3] === true &&
				typeof rawName === 'string' &&
				(rawName === 'class' || rawName === 'className')
			) {
				(classMerges ??= []).push({ rawName, value: source[2], order: sourceOrder++ });
				continue;
			}
			record(rawName, source[2]);
			continue;
		}
		const spread = source[1];
		if (spread == null || (typeof spread !== 'object' && typeof spread !== 'function')) continue;
		for (const name of Object.keys(Object(spread))) {
			record(name, (spread as Record<string, unknown>)[name]);
		}
	}

	// Source reads are complete. Reuse each raw writer as its normalized winner;
	// neither Map escapes this call, and no second per-key tuple is needed.
	const values = new Map<string, HostPropWriter>();
	const html = el.namespaceURI === 'http://www.w3.org/1999/xhtml';
	let needsWinningOrderSort = false;
	for (const writer of props.values()) {
		const rawName = writer.name;
		if (rawName === 'key') continue;
		const identityKey = isHostPropIdentityKey(rawName);
		const name = identityKey ? rawName : normalizedHostProp(el, rawName);
		const identity = html && !identityKey ? name.toLowerCase() : name;
		const previous = values.get(identity);
		if (previous !== undefined) {
			if (previous.lastOrder >= writer.lastOrder) continue;
			// A winning alias can have a later first insertion than this Map entry.
			needsWinningOrderSort = true;
		}
		writer.name =
			process.env.NODE_ENV !== 'production' && (rawName === 'tabIndex' || rawName === 'htmlFor')
				? rawName
				: name;
		values.set(identity, writer);
	}
	if (classMerges !== null) {
		for (const extra of classMerges) {
			const previous = values.get('class');
			if (previous !== undefined) {
				previous.value = mergeClass(previous.value, extra.value);
				previous.lastOrder = extra.order;
			} else {
				values.set('class', {
					name: 'class',
					value: extra.value,
					firstOrder: extra.order,
					lastOrder: extra.order,
				});
			}
		}
	}
	const resolved: Record<string, unknown> = Object.create(null);
	const ordered = needsWinningOrderSort
		? [...values.values()].sort((a, b) => a.firstOrder - b.firstOrder)
		: values.values();
	for (const { name, value } of ordered) resolved[name] = value;
	if (readStyle !== undefined && 'style' in resolved) resolved.style = readStyle(resolved.style);
	return resolved;
}

export function isAggregatedFormControlProp(el: Element, name: string): boolean {
	switch (el.localName) {
		case 'input':
			return (
				name === 'value' ||
				name === 'defaultValue' ||
				name === 'checked' ||
				name === 'defaultChecked'
			);
		case 'textarea':
			return name === 'value' || name === 'defaultValue';
		case 'select':
			return name === 'value' || name === 'defaultValue' || name === 'multiple';
	}
	return false;
}
