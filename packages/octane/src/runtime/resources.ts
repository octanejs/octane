// Head resources are document-owned, shared by public hints and compiled Float calls.
// Keep deduplication and preload metadata in this one owner across both entry points.
declare const process: { env: { NODE_ENV?: string } };

import { resourceHintWarning } from '../resource-hint-diagnostics.js';
import { sanitizeURL, sanitizeURLAttribute } from '../sanitize-url.js';

// ---------------------------------------------------------------------------
// Resource hints — React DOM's preload / preinit / preconnect / prefetchDNS.
// Each call inserts one deduped <link>/<script> into document.head (client).
// Dedupe key = rel/kind + href, matching React's resource identity model.
// ---------------------------------------------------------------------------

const _resourceHints = new Set<string>();

/** Known-hint check shared by insertHeadHint and cross-family suppression. */
function hasHeadHint(key: string): boolean {
	if (_resourceHints.has(key)) return true;
	if (typeof document === 'undefined') return false;
	// SSR dedupe: compare exact attribute VALUES rather than interpolating an
	// href-derived key into a CSS selector. Quotes/brackets are valid URL text;
	// treating them as selector syntax could throw before the hint is inserted.
	const existing = document.head.querySelectorAll('[data-oct-hint]');
	for (let i = 0; i < existing.length; i++) {
		if (existing[i].getAttribute('data-oct-hint') === key) {
			_resourceHints.add(key);
			return true;
		}
	}
	return false;
}

function insertHeadHint(key: string, build: () => Element): void {
	if (typeof document === 'undefined' || hasHeadHint(key)) return;
	const el = build();
	el.setAttribute('data-oct-hint', key);
	document.head.appendChild(el);
	// Publish dedupe state only after every DOM operation succeeds, so a failed
	// build/append cannot poison the key and suppress a later valid retry.
	_resourceHints.add(key);
}

/**
 * Connection/integrity options seeded by preload for the matching preinit —
 * React carries these onto the initialized resource. Keyed `as:href`; the
 * preinit's own options win on collision. Test-only reset rides
 * resetFloatResourceState.
 */
let _preloadTransfer: Map<string, Record<string, unknown>> | null = null;

const TRANSFER_OPTION_KEYS = [
	'crossOrigin',
	'integrity',
	'nonce',
	'fetchPriority',
	'referrerPolicy',
] as const;

function stashPreloadTransfer(kind: string, href: string, options: Record<string, unknown>): void {
	let subset: Record<string, unknown> | null = null;
	for (const k of TRANSFER_OPTION_KEYS) {
		const v = options[k];
		if (v != null) (subset ??= {})[k] = v;
	}
	if (subset !== null) (_preloadTransfer ??= new Map()).set(kind + ':' + href, subset);
}

function takePreloadTransfer(kind: string, href: string): Record<string, unknown> | null {
	if (_preloadTransfer === null) return null;
	const key = kind + ':' + href;
	const found = _preloadTransfer.get(key);
	if (found === undefined) return null;
	_preloadTransfer.delete(key);
	return found;
}

function guardHintHref(href: unknown): string | null {
	return typeof href === 'string' && href !== '' ? href : null;
}

/** The option keys React recognizes on resource hints; everything else drops. */
const KNOWN_HINT_OPTIONS = new Set([
	'as',
	'crossOrigin',
	'integrity',
	'nonce',
	'type',
	'fetchPriority',
	'referrerPolicy',
	'imageSrcSet',
	'imageSizes',
	'media',
]);

function applyHintAttrs(el: Element, opts: Record<string, unknown> | undefined): void {
	if (opts == null) return;
	for (const k in opts) {
		if (!KNOWN_HINT_OPTIONS.has(k)) continue;
		const v = (opts as any)[k];
		if (v == null || v === false) continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		const value = v === true ? '' : String(v);
		el.setAttribute(name, sanitizeURLAttribute(el.localName, name, value));
	}
}

/** React DOM `preload(href, {as, …})` — `<link rel="preload">`. */
export function preload(href: string, options: { as: string } & Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preload', href, options);
		if (warning !== null) console.error(warning);
	}
	const guarded = guardHintHref(href);
	if (guarded === null) return;
	if (
		options === null ||
		typeof options !== 'object' ||
		!options.as ||
		typeof options.as !== 'string'
	)
		return;
	const as = options.as;
	const rawHref = guarded;
	// Fonts must be fetched anonymously to be reusable by CSS — React enforces
	// crossorigin="" regardless of the caller's value; so does Octane.
	if (as === 'font') options = { ...options, crossOrigin: '' };
	// Connection/integrity options seed the matching future preinit (React's
	// resource map carries them onto the initialized resource).
	// A deduped preload must retain the first call's options, even when that
	// call supplied no transferable metadata.
	if ((as === 'style' || as === 'script') && !_resourceHints.has('preload:' + as + ':' + rawHref))
		stashPreloadTransfer(as, rawHref, options);
	// After the matching external resource is already live (a Float resource or
	// preinit), a preload adds nothing. Inline style resources share the sheet
	// identity namespace but cannot consume an external stylesheet preload, so
	// both entries must survive regardless of discovery order. Inspect DOM only
	// on this uncommon identity collision and compare attribute values directly:
	// href text may contain quotes or other CSS-selector metacharacters.
	if (as === 'style' && resourceState().sheets.has(rawHref)) {
		const styles = document.head.querySelectorAll('style[data-precedence]');
		let hasInlineStyle = false;
		for (let i = 0; i < styles.length; i++) {
			if (styles[i].getAttribute('data-href') === rawHref) {
				hasInlineStyle = true;
				break;
			}
		}
		if (!hasInlineStyle) return;
	}
	if (as === 'script' && resourceState().scripts.has(rawHref)) return;
	// Image preloads with a srcset are keyed by the srcset+sizes pair, not the
	// fallback href — two responsive preloads for one href stay distinct.
	const imageSrcSet = as === 'image' ? options.imageSrcSet : undefined;
	const key =
		typeof imageSrcSet === 'string' && imageSrcSet !== ''
			? 'preload:image:' + imageSrcSet + '::' + String(options.imageSizes ?? '')
			: 'preload:' + as + ':' + rawHref;
	const safeHref = sanitizeURL(rawHref);
	const omitHref = typeof imageSrcSet === 'string' && imageSrcSet !== '';
	insertHeadHint(key, () => {
		const l = document.createElement('link');
		l.rel = 'preload';
		// A responsive image preload matches on imagesrcset/imagesizes; the
		// fallback href would double-fetch, so React (and Octane) omit it.
		if (!omitHref) l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/**
 * React DOM `preinit(href, {as: 'style'|'script', …})` — executes/applies the
 * resource. Routes through the Float resource inserts so preinit and the
 * rendered resource forms share ONE identity: a preinit'd stylesheet joins the
 * precedence groups (`precedence` option honored, default `'default'`) and
 * dedupes against `<link rel="stylesheet" precedence>`; a preinit'd script
 * dedupes against `<script async src>`.
 */
export function preinit(href: string, options: { as: string } & Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preinit', href, options);
		if (warning !== null) console.error(warning);
	}
	const guarded = guardHintHref(href);
	if (guarded === null) return;
	if (options === null || typeof options !== 'object') return;
	const as = options?.as;
	if (as !== 'style' && as !== 'script') return;
	const rawHref = guarded;
	const seeded = takePreloadTransfer(as, rawHref);
	if (as === 'style') {
		stylesheetResource({
			...seeded,
			...options,
			as: undefined,
			href: rawHref,
			precedence: (options as any).precedence ?? 'default',
		});
	} else {
		scriptResource({ ...seeded, ...options, as: undefined, href: undefined, src: rawHref });
	}
}

/** React DOM `preconnect(href, {crossOrigin?})` — `<link rel="preconnect">`. */
export function preconnect(href: string, options?: { crossOrigin?: string }): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preconnect', href, options);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	if (options !== null && typeof options !== 'object') options = undefined;
	else if (options?.crossOrigin !== undefined && typeof options.crossOrigin !== 'string') {
		options = undefined;
	}
	const safeHref = sanitizeURL(rawHref);
	const corsMode =
		(options as any)?.crossOrigin == null ? '<none>' : String((options as any).crossOrigin);
	insertHeadHint('preconnect:' + corsMode + ':' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'preconnect';
		l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/** React DOM `prefetchDNS(href)` — `<link rel="dns-prefetch">`. */
export function prefetchDNS(href: string): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('prefetchDNS', href, arguments[1], arguments.length > 1);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('dns-prefetch:' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'dns-prefetch';
		l.href = safeHref;
		return l;
	});
}

/**
 * React DOM `preloadModule(href, options?)` — `<link rel="modulepreload">`.
 * Module preloads dedupe by href alone (React's resource identity for modules);
 * options apply as attributes through the shared lenient pass-through.
 */
export function preloadModule(href: string, options?: Record<string, unknown>): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preloadModule', href, options);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	if (options === null || typeof options !== 'object') options = undefined;
	else if ('as' in options && typeof options.as !== 'string') {
		options = { ...options, as: undefined };
	}
	// A module that preinitModule or a Float script already executes needs no preload.
	if (hasHeadHint('module:' + rawHref) || resourceState().scripts.has(rawHref)) return;
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('modulepreload:' + rawHref, () => {
		const l = document.createElement('link');
		l.rel = 'modulepreload';
		l.href = safeHref;
		applyHintAttrs(l, options);
		return l;
	});
}

/**
 * React DOM `preinitModule(href, options?)` — `<script type="module" async src>`.
 * Only the `script` destination exists for module preinit (React's contract);
 * any other `as` fails closed as a no-op rather than executing the module.
 */
export function preinitModule(
	href: string,
	options?: { as?: string } & Record<string, unknown>,
): void {
	if (process.env.NODE_ENV !== 'production') {
		const warning = resourceHintWarning('preinitModule', href, options);
		if (warning !== null) console.error(warning);
	}
	const rawHref = guardHintHref(href);
	if (rawHref === null) return;
	if (options != null && typeof options !== 'object') return;
	if ((options?.as ?? 'script') !== 'script') return;
	// One executable per src: a live Float script (SSR-seeded or client-
	// discovered) already satisfies this init.
	const state = resourceState();
	if (state.scripts.has(rawHref)) return;
	const safeHref = sanitizeURL(rawHref);
	insertHeadHint('module:' + rawHref, () => {
		const s = document.createElement('script');
		s.type = 'module';
		(s as HTMLScriptElement).src = safeHref;
		(s as HTMLScriptElement).async = true;
		applyHintAttrs(s, options ? { ...options, as: undefined } : undefined);
		return s;
	});
	state.scripts.add(rawHref);
}

// ---------------------------------------------------------------------------
// React Float resources — `<link rel="stylesheet" href precedence>` and
// `<script async src>` rendered at a component's body root. Unlike per-site
// hoisted head elements (headBlock), a resource is GLOBAL: keyed by href/src,
// deduped across the whole page, stylesheet groups ordered by precedence
// (first-encounter group order, appended within a group), and RETAINED after
// unmount — unloading a stylesheet or re-running a script is never safe, so
// React never removes resources and neither does Octane. The one exception is
// a root that replaces a failed hydration: it discards the resources in the
// server DOM it clears (hydrationFallbackNodes), as React's clearContainer
// does for an element container, and since the dedupe state still counts
// them, its client render does not insert them again. Suspend-until-loaded
// ("suspensey" commit) is deliberately out of scope. The first client call
// seeds dedupe state from SSR-emitted tags (data-precedence / data-oct-res),
// so hydration never duplicates.
// ---------------------------------------------------------------------------

interface ResourceState {
	sheets: Set<string>;
	scripts: Set<string>;
	/** Last live element of each stylesheet precedence group. */
	tails: Map<string, Element>;
	/** Tail of the LAST group in document order — where a new group starts. */
	lastTail: Element | null;
}

let _resourceState: ResourceState | null = null;

function resourceState(): ResourceState {
	if (_resourceState !== null) return _resourceState;
	const state: ResourceState = {
		sheets: new Set(),
		scripts: new Set(),
		tails: new Map(),
		lastTail: null,
	};
	if (typeof document !== 'undefined') {
		// Stylesheet links and style resources share one identity namespace and
		// one precedence-group ordering; querySelectorAll returns document order,
		// so tails/lastTail land on each group's last member.
		const sheets = document.querySelectorAll(
			'link[rel="stylesheet"][data-precedence], style[data-precedence]',
		);
		for (let i = 0; i < sheets.length; i++) {
			const el = sheets[i];
			const href = el.getAttribute('href') ?? el.getAttribute('data-href');
			if (href !== null) state.sheets.add(href);
			state.tails.set(el.getAttribute('data-precedence') as string, el);
			state.lastTail = el;
		}
		// One executable identity per src: classic Float scripts (data-oct-res)
		// AND preinitModule scripts (data-oct-hint "module:…") share the set.
		const scripts = document.querySelectorAll('script[data-oct-res], script[data-oct-hint]');
		for (let i = 0; i < scripts.length; i++) {
			const el = scripts[i];
			const hint = el.getAttribute('data-oct-hint');
			if (hint !== null && !hint.startsWith('module:')) continue;
			const src = el.getAttribute('src');
			if (src !== null) state.scripts.add(src);
		}
		// Streaming SSR can deliver Float sheets AFTER this state seeded (a late
		// boundary's wave carrier arriving mid-hydration). The stream's inline
		// $OCTRH hands each tag to this registrar once it exists, so one live
		// authority keeps deduping and precedence ordering in both directions;
		// before any client Float call the inline path inserts directly and the
		// DOM seeding above adopts what it placed.
		if (typeof window !== 'undefined') {
			(window as any).$OCTFR = (el: Element): void => {
				const href = el.getAttribute('href') ?? el.getAttribute('data-href');
				if (href === null || state.sheets.has(href)) return;
				insertPrecedenced(state, el, el.getAttribute('data-precedence') ?? '');
				state.sheets.add(href);
			};
		}
	}
	return (_resourceState = state);
}

/** Insert a sheet-family resource into its precedence group (shared ordering). */
function insertPrecedenced(state: ResourceState, el: Element, precedence: string): void {
	const tail = state.tails.get(precedence);
	if (tail !== undefined && tail.isConnected) {
		// Existing group: append after its current tail.
		tail.after(el);
		if (state.lastTail === tail) state.lastTail = el;
	} else if (state.lastTail !== null && state.lastTail.isConnected) {
		// New group: starts after the last existing group, keeping groups
		// contiguous in first-encounter order.
		state.lastTail.after(el);
		state.lastTail = el;
	} else {
		document.head.appendChild(el);
		state.lastTail = el;
	}
	state.tails.set(precedence, el);
}

/** Handled by the resource insert itself; everything else applies as an attribute. */
const RESOURCE_OWN_ATTRS = new Set(['precedence', 'href', 'src', 'rel', 'async']);

function applyResourceAttrs(el: Element, attrs: Record<string, unknown>): void {
	for (const k in attrs) {
		if (RESOURCE_OWN_ATTRS.has(k)) continue;
		const v = (attrs as any)[k];
		if (v == null || v === false || typeof v === 'function') continue;
		const name = k === 'crossOrigin' ? 'crossorigin' : k.toLowerCase();
		el.setAttribute(name, sanitizeURLAttribute(el.localName, name, v === true ? '' : String(v)));
	}
}

function warnInvalidStylesheetResource(reason: string): void {
	let conflict: string;
	if (reason === 'missing-href') {
		conflict = 'requires a non-empty string `href`';
	} else if (reason === 'empty-href') {
		conflict = 'has an empty `href`; a stylesheet resource requires a non-empty string `href`';
	} else {
		const props = reason === 'onLoad+onError' ? '`onLoad` and `onError`' : '`' + reason + '`';
		conflict = 'also has ' + props + ', which requires an independently managed stylesheet';
	}
	console.error(
		'A <link rel="stylesheet"> with `precedence` ' +
			conflict +
			'. It will not be hoisted or deduplicated; remove the conflicting prop or `precedence`.',
	);
}

/** Compiler target for `<link rel="stylesheet" href precedence>` (React Float). */
export function stylesheetResource(
	attrs: Record<string, unknown> | null,
	invalidReason?: string,
): void {
	if (process.env.NODE_ENV !== 'production' && invalidReason !== undefined) {
		warnInvalidStylesheetResource(invalidReason);
		return;
	}
	if (typeof document === 'undefined' || attrs == null) return;
	const href = attrs.href;
	if (typeof href !== 'string' || href === '') return;
	const state = resourceState();
	// First instance wins, including its non-key props — matching React's
	// resource identity (later differing props do not retarget a live sheet).
	if (state.sheets.has(href)) return;
	const precedence = attrs.precedence == null ? '' : String(attrs.precedence);
	const l = document.createElement('link');
	l.rel = 'stylesheet';
	l.href = sanitizeURL(href);
	l.setAttribute('data-precedence', precedence);
	applyResourceAttrs(l, attrs);
	insertPrecedenced(state, l, precedence);
	state.sheets.add(href);
}

/**
 * Compiler target for `<style href precedence>` (React Float style resource).
 * Plain CSS keyed by href identity — shares the stylesheet dedupe namespace and
 * precedence-group ordering with link resources; the CSS ships as the tag's
 * text content and is NOT scoped (scoped CSS owns every other `<style>`).
 */
export function styleResource(
	attrs: Record<string, unknown> | null,
	css: string,
	development?: boolean,
): void {
	if (typeof document === 'undefined' || attrs == null) return;
	const href = attrs.href;
	if (typeof href !== 'string' || href === '') return;
	const state = resourceState();
	if (state.sheets.has(href)) return;
	if (
		process.env.NODE_ENV !== 'production' &&
		development === true &&
		hasHeadHint('preload:style:' + href)
	) {
		console.error(
			'A <style> resource with href "' +
				href +
				'" follows a stylesheet preload for the same href. ' +
				'Inline styles cannot consume a stylesheet preload; remove the preload or use a stylesheet link.',
		);
	}
	const precedence = attrs.precedence == null ? '' : String(attrs.precedence);
	// textContent makes any CSS safe to insert client-side, but the SSR twin
	// must fail closed on "</style" (raw-text serialization) — surface the same
	// authoring diagnostic here so SPA-only development still sees it.
	if (process.env.NODE_ENV !== 'production' && /<\/style/i.test(css)) {
		console.error(
			'A <style href precedence> resource contains "</style"; server rendering will skip it. ' +
				'Load it as a stylesheet link instead.',
		);
	}
	const s = document.createElement('style');
	s.setAttribute('data-precedence', precedence);
	s.setAttribute('data-href', href);
	applyResourceAttrs(s, attrs);
	s.textContent = css;
	insertPrecedenced(state, s, precedence);
	state.sheets.add(href);
}

/**
 * TEST-ONLY: forget all Float resource identity (this repo's test isolation).
 * Resources are page-global by contract — a real page never resets them.
 */
export function resetFloatResourceState(): void {
	_resourceState = null;
	_preloadTransfer = null;
	// The streamed-resource registrar closes over the discarded state.
	if (typeof window !== 'undefined') delete (window as any).$OCTFR;
}

/** Compiler target for `<script async src>` resources (React Float). */
export function scriptResource(attrs: Record<string, unknown> | null): void {
	if (typeof document === 'undefined' || attrs == null) return;
	const src = attrs.src;
	if (typeof src !== 'string' || src === '') return;
	const state = resourceState();
	if (state.scripts.has(src)) return;
	const s = document.createElement('script');
	(s as HTMLScriptElement).src = sanitizeURL(src);
	(s as HTMLScriptElement).async = true;
	s.setAttribute('data-oct-res', '');
	applyResourceAttrs(s, attrs);
	document.head.appendChild(s);
	state.scripts.add(src);
}
