import { LYNX_NODES_REF_ATTRIBUTE } from './nodes-ref.js';
import {
	parseLynxMainThreadEventProp,
	parseLynxNativeEventProp,
	type LynxMainThreadEventBinding,
} from './native-events.js';
import {
	assertLynxWorkletValue,
	isLynxMainThreadRefDescriptor,
	isLynxMainThreadWorkletDescriptor,
	unwrapThreadFunctionDescriptor,
	type LynxMainThreadRefDescriptor,
	type LynxMainThreadWorkletDescriptor,
} from './worklets.js';

export type { LynxMainThreadRefDescriptor, LynxMainThreadWorkletDescriptor } from './worklets.js';

/**
 * Compiler-owned prop carrying the CSS scope selected for one Lynx host node.
 *
 * This must never be forwarded through `__SetAttribute`. The compiler must
 * stamp it on every host in a scoped template; the PAPI driver consumes it
 * through `__SetCSSId`.
 */
export const LYNX_CSS_SCOPE_PROP = '__octane_lynx_css_scope__';

export const LYNX_DEFAULT_ENTRY_NAME = '__Card__';

export const LYNX_LENGTH_UNITS = Object.freeze([
	'px',
	'rpx',
	'ppx',
	'em',
	'rem',
	'vh',
	'vw',
	'%',
] as const);

export type LynxClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly LynxClassValue[]
	| { readonly [name: string]: unknown };

export interface LynxCSSScopeMetadata {
	readonly cssId?: number;
	readonly entryName?: string;
}

export interface NormalizedLynxCSSScope {
	readonly cssId: number;
	readonly entryName?: string;
}

export type LynxHostPropRoute =
	| 'attribute'
	| 'classes'
	| 'css-scope'
	| 'dataset'
	| 'event'
	| 'id'
	| 'inline-styles'
	| 'main-thread-event'
	| 'main-thread-ref'
	| 'reserved';

export interface LynxValuePatch<T> {
	readonly value: T;
}

export interface LynxDatasetPatch extends LynxValuePatch<Readonly<Record<string, unknown>>> {
	/** Dataset keys that disappeared from the accepted prop bag. */
	readonly removed: readonly string[];
}

export interface LynxAttributePatch {
	readonly name: string;
	/** `null` means remove the attribute. */
	readonly value: unknown;
}

export interface LynxMainThreadEventPatch {
	readonly binding: LynxMainThreadEventBinding;
	/** `null` removes the direct main-thread handler. */
	readonly value: LynxMainThreadWorkletDescriptor | null;
}

/**
 * Semantic PAPI channels changed by a host prop update. Channel order is not a
 * public contract; a driver may apply these in its own accepted-batch order.
 */
export interface LynxHostPropPatch {
	readonly id?: LynxValuePatch<string | null>;
	readonly classes?: LynxValuePatch<string>;
	readonly inlineStyles?: LynxValuePatch<string>;
	readonly dataset?: LynxDatasetPatch;
	readonly cssScope?: LynxValuePatch<NormalizedLynxCSSScope>;
	readonly mainThreadEvents: readonly LynxMainThreadEventPatch[];
	readonly mainThreadRef?: LynxValuePatch<LynxMainThreadRefDescriptor | null>;
	readonly attributes: readonly LynxAttributePatch[];
	/** The public PAPI has no operation that removes a previously applied CSS ID. */
	readonly requiresRecreate: boolean;
}

const NAMESPACED_EVENT_PROP =
	/^[A-Za-z-]+:(?:global-bind|bind|catch|capture-bind|capture-catch)[A-Za-z]+$/;
const MAIN_THREAD_PROP = /^main-thread:/;
const NUMBER_WITH_OPTIONAL_UNIT =
	/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?([A-Za-z%]*)$/;
const SUPPORTED_LENGTH =
	/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?(?:px|rpx|ppx|em|rem|vh|vw|%)$/i;
const ZERO = /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:[eE][+-]?\d+)?$/;
const LENGTH_PROPERTY =
	/^(?:width|height|min-width|max-width|min-height|max-height|top|right|bottom|left|inset(?:-(?:top|right|bottom|left|inline-start|inline-end))?|margin(?:-(?:top|right|bottom|left|inline-start|inline-end))?|padding(?:-(?:top|right|bottom|left|inline-start|inline-end))?|gap|row-gap|column-gap|flex-basis|font-size|letter-spacing|text-indent|perspective|border(?:-(?:top|right|bottom|left))?-width|border(?:-(?:top|bottom)-(?:left|right)|-(?:start|end)-(?:start|end))?-radius)$/;

const hasOwn = (value: Readonly<Record<string, unknown>>, name: string): boolean =>
	Object.prototype.hasOwnProperty.call(value, name);

function propError(message: string): Error {
	return new TypeError(`Octane Lynx host prop: ${message}`);
}

/** Octane's clsx-style class composition without importing the DOM runtime. */
export function normalizeLynxClass(value: LynxClassValue | unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value !== 'object') {
		return typeof value === 'number' && value ? String(value) : '';
	}
	if (value === null) return '';

	let result = '';
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			const item = value[index];
			if (!item) continue;
			const normalized = normalizeLynxClass(item);
			if (normalized) result = result ? `${result} ${normalized}` : normalized;
		}
		return result;
	}

	for (const name of Object.keys(value)) {
		if ((value as Record<string, unknown>)[name]) {
			result = result ? `${result} ${name}` : name;
		}
	}
	return result;
}

/** True for one literal Lynx `<length>` token; `calc()`/`var()` are not literals. */
export function isSupportedLynxLengthLiteral(value: unknown): boolean {
	if (typeof value === 'number') return Number.isFinite(value) && value === 0;
	if (typeof value !== 'string') return false;
	const token = value.trim();
	return ZERO.test(token) || SUPPORTED_LENGTH.test(token);
}

function styleName(name: string): string {
	if (name.startsWith('--')) {
		if (!/^--[A-Za-z0-9_-]+$/.test(name)) {
			throw propError(`invalid CSS custom property ${JSON.stringify(name)}.`);
		}
		return name;
	}
	if (!/^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
		throw propError(`invalid inline-style property ${JSON.stringify(name)}.`);
	}
	const hyphenated = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
	return hyphenated.startsWith('ms-') ? `-${hyphenated}` : hyphenated;
}

function styleValue(name: string, value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw propError(`inline-style property ${JSON.stringify(name)} must be finite.`);
		}
		// Pinned Lynx CSSProperties and ReactLynx's dynamic style path both admit
		// numeric values. Do not guess a unit or rewrite them.
		return String(value);
	}
	if (typeof value !== 'string') {
		throw propError(
			`inline-style property ${JSON.stringify(name)} must be a string, number, null, or undefined.`,
		);
	}

	// Validate only a complete numeric dimension token. Functional values such
	// as calc()/var() require the native CSS parser and are preserved verbatim.
	const dimension = NUMBER_WITH_OPTIONAL_UNIT.exec(value.trim());
	if (dimension !== null && LENGTH_PROPERTY.test(name) && !isSupportedLynxLengthLiteral(value)) {
		throw propError(
			`inline-style property ${JSON.stringify(name)} uses unsupported Lynx length ${JSON.stringify(value)}.`,
		);
	}
	return value;
}

/**
 * Normalize an inline style to the string accepted by public
 * `__SetInlineStyles`. String styles remain byte-for-byte unchanged; object
 * keys are hyphenated and nullish declarations are omitted.
 */
export function normalizeLynxInlineStyle(value: unknown): string | undefined {
	if (value === null || value === undefined) return undefined;
	if (typeof value === 'string') return value;
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw propError('style must be a string, a plain object, null, or undefined.');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw propError('style must be a plain object.');
	}

	let result = '';
	for (const [rawName, rawValue] of Object.entries(value)) {
		const name = styleName(rawName);
		const normalized = styleValue(name, rawValue);
		if (normalized === null) continue;
		result += result ? `;${name}:${normalized}` : `${name}:${normalized}`;
	}
	return result;
}

/** Alias that makes the host boundary's serialization step explicit. */
export const serializeLynxInlineStyle = normalizeLynxInlineStyle;

function scopeId(value: unknown): number {
	if (!Number.isSafeInteger(value)) {
		throw propError('CSS scope cssId must be a safe integer.');
	}
	return Object.is(value, -0) ? 0 : (value as number);
}

/**
 * Decode compiler-owned CSS scope metadata into `__SetCSSId` arguments.
 * A lazy entry without a file scope still needs CSS ID 0, matching ReactLynx.
 */
export function decodeLynxCSSScopeMetadata(value: unknown): NormalizedLynxCSSScope | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return Object.freeze({ cssId: scopeId(value) });
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw propError('CSS scope metadata must be a number, plain object, null, or undefined.');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw propError('CSS scope metadata must be a plain object.');
	}
	for (const name of Object.keys(value)) {
		if (name !== 'cssId' && name !== 'entryName') {
			throw propError(`CSS scope metadata contains unknown field ${JSON.stringify(name)}.`);
		}
	}
	const metadata = value as LynxCSSScopeMetadata;
	let entryName = metadata.entryName;
	if (entryName !== undefined) {
		if (typeof entryName !== 'string' || entryName.length === 0) {
			throw propError('CSS scope entryName must be a non-empty string when present.');
		}
		if (entryName === LYNX_DEFAULT_ENTRY_NAME) entryName = undefined;
	}
	if (metadata.cssId === undefined && entryName === undefined) return null;
	const cssId = metadata.cssId === undefined ? 0 : scopeId(metadata.cssId);
	return Object.freeze({ cssId, ...(entryName === undefined ? null : { entryName }) });
}

/**
 * Rspeedy/Rsbuild encode imported files as URL strings (including data URIs).
 * The pinned Element PAPI exposes no framework-neutral object resource codec,
 * so native handles and arbitrary objects are rejected here.
 */
export function decodeLynxAssetSource(value: unknown, name = 'asset source'): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') {
		throw propError(`${name} must be a bundled URL string, data URI, null, or undefined.`);
	}
	return value;
}

export function classifyLynxHostPropName(name: string): LynxHostPropRoute {
	if (name === 'id') return 'id';
	if (name === 'class' || name === 'className') return 'classes';
	if (name === 'style') return 'inline-styles';
	if (name.startsWith('data-')) return 'dataset';
	if (name === LYNX_CSS_SCOPE_PROP) return 'css-scope';
	if (name === 'main-thread:ref') return 'main-thread-ref';
	if (parseLynxMainThreadEventProp(name) !== null) return 'main-thread-event';
	if (parseLynxNativeEventProp(name) !== null) return 'event';
	if (MAIN_THREAD_PROP.test(name) || NAMESPACED_EVENT_PROP.test(name)) return 'reserved';
	if (
		name === 'children' ||
		name === 'css-id' ||
		name === 'key' ||
		name === LYNX_NODES_REF_ATTRIBUTE ||
		name === 'ref'
	) {
		return 'reserved';
	}
	return 'attribute';
}

function decodeMainThreadWorklet(
	value: unknown,
	name: string,
): LynxMainThreadWorkletDescriptor | null {
	if (value === null || value === undefined) return null;
	let descriptor = value;
	if (typeof value === 'function') {
		try {
			descriptor = unwrapThreadFunctionDescriptor(value);
		} catch {
			throw propError(
				`${JSON.stringify(name)} must be a main-thread worklet descriptor with a non-empty _wkltId.`,
			);
		}
	}
	assertLynxWorkletValue(descriptor, JSON.stringify(name));
	if (!isLynxMainThreadWorkletDescriptor(descriptor)) {
		throw propError(
			`${JSON.stringify(name)} must be a main-thread worklet descriptor with a non-empty _wkltId.`,
		);
	}
	if (descriptor._owlt !== undefined) {
		throw propError(`${JSON.stringify(name)} cannot contain a main-local _owlt activation.`);
	}
	return descriptor;
}

function decodeMainThreadRef(value: unknown): LynxMainThreadRefDescriptor | null {
	if (value === null || value === undefined) return null;
	assertLynxWorkletValue(value, '"main-thread:ref"');
	if (!isLynxMainThreadRefDescriptor(value)) {
		throw propError(
			'"main-thread:ref" must be a main-thread ref descriptor with a non-empty _wvid.',
		);
	}
	return value;
}

interface StructuredValuePairs {
	readonly firstToSecond: WeakMap<object, object>;
	readonly secondToFirst: WeakMap<object, object>;
}

function sameStructuredValueWithPairs(
	first: unknown,
	second: unknown,
	pairs: StructuredValuePairs,
): boolean {
	if (Object.is(first, second)) return true;
	if (
		first === null ||
		second === null ||
		typeof first !== 'object' ||
		typeof second !== 'object'
	) {
		return false;
	}
	const pairedSecond = pairs.firstToSecond.get(first);
	if (pairedSecond !== undefined) return pairedSecond === second;
	const pairedFirst = pairs.secondToFirst.get(second);
	if (pairedFirst !== undefined) return pairedFirst === first;
	pairs.firstToSecond.set(first, second);
	pairs.secondToFirst.set(second, first);
	if (Array.isArray(first) || Array.isArray(second)) {
		if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length)
			return false;
		for (let index = 0; index < first.length; index++) {
			if (!sameStructuredValueWithPairs(first[index], second[index], pairs)) return false;
		}
		return true;
	}
	const firstNames = Object.keys(first);
	const secondNames = Object.keys(second);
	if (firstNames.length !== secondNames.length) return false;
	for (const name of firstNames) {
		if (
			!hasOwn(second as Readonly<Record<string, unknown>>, name) ||
			!sameStructuredValueWithPairs(
				(first as Readonly<Record<string, unknown>>)[name],
				(second as Readonly<Record<string, unknown>>)[name],
				pairs,
			)
		) {
			return false;
		}
	}
	return true;
}

function sameStructuredValue(first: unknown, second: unknown): boolean {
	if (Object.is(first, second)) return true;
	return sameStructuredValueWithPairs(first, second, {
		firstToSecond: new WeakMap(),
		secondToFirst: new WeakMap(),
	});
}

function mainThreadEventPropNames(
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
): readonly string[] {
	const names = new Set<string>();
	for (const name of Object.keys(previous)) {
		if (parseLynxMainThreadEventProp(name) !== null) names.add(name);
	}
	for (const name of Object.keys(next)) {
		if (parseLynxMainThreadEventProp(name) !== null) names.add(name);
	}
	return [...names].sort();
}

function classProp(value: Readonly<Record<string, unknown>>): unknown {
	// The compiler should canonicalize authored order. This deterministic
	// fallback prevents both aliases from becoming two PAPI writes.
	if (hasOwn(value, 'className')) return value.className;
	return value.class;
}

export function normalizeLynxDataset(
	props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	const dataset = Object.create(null) as Record<string, unknown>;
	for (const name of Object.keys(props)) {
		if (!name.startsWith('data-')) continue;
		const key = name.slice(5);
		if (key.length === 0) throw propError('dataset prop `data-` requires a non-empty key.');
		const value = props[name];
		// Pinned ReactLynx preserves an explicit null dataset value. Undefined
		// (or omission) removes the key from the complete replacement bag.
		if (value !== undefined) dataset[key] = value;
	}
	return Object.freeze(dataset);
}

function sameDataset(
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
): boolean {
	const previousNames = Object.keys(previous);
	const nextNames = Object.keys(next);
	if (previousNames.length !== nextNames.length) return false;
	for (const name of nextNames) {
		if (!hasOwn(previous, name) || !Object.is(previous[name], next[name])) return false;
	}
	return true;
}

function sameScope(
	previous: NormalizedLynxCSSScope | null,
	next: NormalizedLynxCSSScope | null,
): boolean {
	return (
		previous === next ||
		(previous !== null &&
			next !== null &&
			Object.is(previous.cssId, next.cssId) &&
			previous.entryName === next.entryName)
	);
}

function attributeValue(type: string, name: string, value: unknown): unknown {
	if (type === 'image' && (name === 'src' || name === 'placeholder')) {
		return decodeLynxAssetSource(value, `<image> ${name}`);
	}
	return value === null || value === undefined ? null : value;
}

/** Build a semantic prop diff for the public Lynx Element PAPI channels. */
export function planLynxHostPropPatch(
	type: string,
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
): LynxHostPropPatch {
	if (type === '#text' || type === 'raw-text') {
		const directProp = [...Object.keys(previous), ...Object.keys(next)].find(
			(name) => name === 'main-thread:ref' || parseLynxMainThreadEventProp(name) !== null,
		);
		if (directProp !== undefined) {
			throw propError(
				`raw-text hosts cannot own direct main-thread prop ${JSON.stringify(directProp)}.`,
			);
		}
	}
	if (hasOwn(next, LYNX_NODES_REF_ATTRIBUTE)) {
		throw propError(
			`${JSON.stringify(LYNX_NODES_REF_ATTRIBUTE)} is reserved for generation-scoped query handles.`,
		);
	}
	for (const name of Object.keys(next)) {
		if (classifyLynxHostPropName(name) === 'reserved' && name.includes(':')) {
			throw propError(
				`namespaced prop ${JSON.stringify(name)} is not a supported Lynx host capability.`,
			);
		}
	}
	const patch: {
		id?: LynxValuePatch<string | null>;
		classes?: LynxValuePatch<string>;
		inlineStyles?: LynxValuePatch<string>;
		dataset?: LynxDatasetPatch;
		cssScope?: LynxValuePatch<NormalizedLynxCSSScope>;
		mainThreadEvents: LynxMainThreadEventPatch[];
		mainThreadRef?: LynxValuePatch<LynxMainThreadRefDescriptor | null>;
		attributes: LynxAttributePatch[];
		requiresRecreate: boolean;
	} = { attributes: [], mainThreadEvents: [], requiresRecreate: false };

	for (const name of mainThreadEventPropNames(previous, next)) {
		const binding = parseLynxMainThreadEventProp(name)!;
		const previousValue = decodeMainThreadWorklet(previous[name], name);
		const nextValue = decodeMainThreadWorklet(next[name], name);
		const ordinaryName = `${binding.prefix}${binding.name}`;
		if (nextValue !== null && next[ordinaryName] !== null && next[ordinaryName] !== undefined) {
			throw propError(
				`${JSON.stringify(name)} conflicts with ${JSON.stringify(ordinaryName)} on the same native event channel.`,
			);
		}
		if (!sameStructuredValue(previousValue, nextValue)) {
			patch.mainThreadEvents.push(Object.freeze({ binding, value: nextValue }));
		}
	}

	const previousMainThreadRef = decodeMainThreadRef(previous['main-thread:ref']);
	const nextMainThreadRef = decodeMainThreadRef(next['main-thread:ref']);
	if (!sameStructuredValue(previousMainThreadRef, nextMainThreadRef)) {
		patch.mainThreadRef = Object.freeze({ value: nextMainThreadRef });
	}

	const previousId = previous.id == null ? null : String(previous.id);
	const nextId = next.id == null ? null : String(next.id);
	if (previousId !== nextId) patch.id = Object.freeze({ value: nextId });

	const previousClass = normalizeLynxClass(classProp(previous));
	const nextClass = normalizeLynxClass(classProp(next));
	if (previousClass !== nextClass) patch.classes = Object.freeze({ value: nextClass });

	const previousStyle = normalizeLynxInlineStyle(previous.style) ?? '';
	const nextStyle = normalizeLynxInlineStyle(next.style) ?? '';
	if (previousStyle !== nextStyle) patch.inlineStyles = Object.freeze({ value: nextStyle });

	const previousDataset = normalizeLynxDataset(previous);
	const nextDataset = normalizeLynxDataset(next);
	if (!sameDataset(previousDataset, nextDataset)) {
		const removed = Object.keys(previousDataset).filter((name) => !hasOwn(nextDataset, name));
		patch.dataset = Object.freeze({ value: nextDataset, removed: Object.freeze(removed) });
	}

	const previousScope = decodeLynxCSSScopeMetadata(previous[LYNX_CSS_SCOPE_PROP]);
	const nextScope = decodeLynxCSSScopeMetadata(next[LYNX_CSS_SCOPE_PROP]);
	if (!sameScope(previousScope, nextScope)) {
		if (nextScope === null) patch.requiresRecreate = previousScope !== null;
		else patch.cssScope = Object.freeze({ value: nextScope });
	}

	for (const name of Object.keys(next)) {
		if (classifyLynxHostPropName(name) !== 'attribute') continue;
		const nextValue = attributeValue(type, name, next[name]);
		const previousValue = hasOwn(previous, name)
			? attributeValue(type, name, previous[name])
			: null;
		if (!Object.is(previousValue, nextValue)) {
			patch.attributes.push(Object.freeze({ name, value: nextValue }));
		}
	}
	for (const name of Object.keys(previous)) {
		if (hasOwn(next, name) || classifyLynxHostPropName(name) !== 'attribute') continue;
		if (attributeValue(type, name, previous[name]) !== null) {
			patch.attributes.push(Object.freeze({ name, value: null }));
		}
	}

	Object.freeze(patch.attributes);
	Object.freeze(patch.mainThreadEvents);
	return Object.freeze(patch);
}
