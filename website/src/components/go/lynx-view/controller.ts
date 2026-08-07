// Mounting a Lynx-for-Web bundle in a `<lynx-view>`, with no UI framework.
//
// Adapted from @lynx-js/go-web (Apache-2.0),
// src/example-preview/components/web-iframe.tsx. See ./UPSTREAM.md.
//
// go-web's version is a React component, so the viewport arithmetic, the
// browserConfig ordering and the "has it actually painted yet" machine are
// entangled with hooks. Everything below is that behaviour with the React
// removed: `mountLynxView` owns a subtree of plain elements and reports state
// through a callback, so any renderer — React, Octane, or none — can drive it.
//
// The three things this exists to get right, none of which are obvious:
//
//  1. `browserConfig` is a *property* and must be assigned before `url`, or the
//     page renders against the wrong pixel ratio.
//  2. A Lynx example is authored for a phone viewport. Below a threshold the
//     view stays at its design size and is transformed down (`fit`); above it,
//     the view takes the container and `rpx`/`vw`/`vh` are re-based onto it
//     (`responsive`). Crossing that boundary uses hysteresis, or a resize drags
//     the layout back and forth across it.
//  3. There is no public "rendered" event. The page root appearing inside the
//     shadow tree is the signal, and it has to ignore the disposed root left
//     behind by a reload.

import {
	clamp01,
	computeFrameOffset,
	computeScaleRange,
	isFinitePositive,
	lerpFitScale,
	smoothstep01,
} from './fit.ts';
import {
	playAutoGesture,
	type AutoGestureHandle,
	type AutoGestureOptions,
} from './auto-gesture.ts';
import {
	resolveWebPreviewModeWithHysteresis,
	type ResolvedWebPreviewFitKind,
	type ResolvedWebPreviewMode,
	type WebPreviewMode,
} from './mode.ts';

/** web-core marks a torn-down page root with this before clearing the shadow. */
const DISPOSED_ATTRIBUTE = 'l-disposed';

/** How long a resize must be settled before the page is rebuilt for it. */
const VIEWPORT_RESYNC_MS = 400;

/** Lynx's `rpx` is defined against a 750-wide design baseline. */
const RPX_BASELINE = 750;

export type LynxViewStage = 'runtime' | 'downloading' | 'rendering' | 'rendered';

export interface LynxViewState {
	/** The Lynx runtime module has loaded. Says nothing about the bundle. */
	ready: boolean;
	/** The page has painted inside the shadow tree (or the fallback fired). */
	rendered: boolean;
	stage: LynxViewStage;
	error: string | null;
	/**
	 * The bundle has been fetched, so `reload()` rebuilds the page without going
	 * back to the network and a refresh control is worth offering. go-web reports
	 * the same fact through its `onCanRefreshChange` callback.
	 */
	canRefresh: boolean;
}

export interface LynxViewOptions {
	/** URL of the `.web.bundle` to mount. */
	url: string;
	/** Resolves once `<lynx-view>` is defined. Injected, so this module never picks how. */
	loadRuntime: () => Promise<void>;
	/** The viewport the example was authored against. */
	designWidth?: number;
	designHeight?: number;
	/** `auto` picks between the two below by container size. */
	webPreviewMode?: WebPreviewMode;
	/** How the fit path fills the container. `auto` blends contain and cover. */
	fit?: 'contain' | 'cover' | 'auto';
	/** Width ratio under which `auto` enters the fit path. */
	fitThresholdScale?: number;
	/** Height ratio under which `auto` enters the fit path. */
	fitMinScale?: number;
	/** Views sharing an id may share a background thread. */
	groupId?: number;
	/** Uncover the preview anyway if the page signal never arrives. */
	renderTimeoutMs?: number;
	/**
	 * Demonstrate the example with simulated touches once it has painted. For a
	 * gesture-driven example this is the only way an embedded preview shows what
	 * it does; see ./auto-gesture.ts.
	 */
	autoGesture?: AutoGestureOptions;
	onStateChange?: (state: LynxViewState) => void;
}

export interface LynxViewHandle {
	/** Soft refresh: rebuild the page without re-downloading the bundle. */
	reload: () => void;
	dispose: () => void;
}

interface LynxViewElement extends HTMLElement {
	browserConfig: { pixelWidth: number; pixelHeight: number; pixelRatio: number };
}

// `responsive` matches go-web's own default, and the match matters: the fit
// path scales the view with a CSS transform, and web-core measures the list
// through getBoundingClientRect. Under a transform those measurements come back
// in visual pixels while the positions are written in layout pixels, so a
// waterfall <list> packs its cells by the scale factor and they overlap. A
// preview panel is almost always smaller than a phone, so `auto` would pick fit
// nearly everywhere and make that the normal case.
const DEFAULTS = {
	designWidth: 375,
	designHeight: 812,
	webPreviewMode: 'responsive' as WebPreviewMode,
	fit: 'auto' as const,
	fitThresholdScale: 1,
	fitMinScale: 0.5,
	groupId: 42,
	renderTimeoutMs: 8000,
};

/**
 * Mount a Lynx-for-Web bundle into `container`.
 *
 * `container` is measured, so it must have a definite size of its own; the
 * elements below it are created and owned here.
 */
export function mountLynxView(container: HTMLElement, options: LynxViewOptions): LynxViewHandle {
	// The required options stay out of the merge so they keep their types; the
	// optional ones skip absent keys rather than spreading them, because an
	// explicitly-undefined option (a caller forwarding its own optional prop)
	// would otherwise erase the default it is asking for.
	const { url, loadRuntime, onStateChange } = options;
	const settings = { ...DEFAULTS, ...omitUndefined(options) };
	const { designWidth, designHeight } = settings;

	let disposed = false;
	let view: LynxViewElement | undefined;
	let browserConfigInitialized = false;
	let renderObserver: MutationObserver | undefined;
	let shadowPoll = 0;
	let renderTimeout: ReturnType<typeof setTimeout> | undefined;
	let previousPage: Element | null = null;
	let gesture: AutoGestureHandle | undefined;
	// The viewport the current page was built against, and the timer that
	// rebuilds it once a resize settles.
	let builtWidth = 0;
	let builtHeight = 0;
	let resyncTimer: ReturnType<typeof setTimeout> | undefined;

	let state: LynxViewState = {
		ready: false,
		rendered: false,
		stage: 'runtime',
		error: null,
		canRefresh: false,
	};
	const publish = (next: Partial<LynxViewState>) => {
		if (disposed) return;
		state = { ...state, ...next };
		onStateChange?.(state);
	};

	// The subtree go-web builds: a centred flex box, an anchor the fit path
	// positions against, and the frame that carries the transform.
	const inner = document.createElement('div');
	inner.style.cssText =
		'display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden';
	const stage = document.createElement('div');
	const frame = document.createElement('div');
	stage.append(frame);
	inner.append(stage);
	container.append(inner);

	let resolvedMode: ResolvedWebPreviewMode = 'responsive';
	let resolvedFitKind: ResolvedWebPreviewFitKind = null;
	let containerWidth = 0;
	let containerHeight = 0;
	let hasLaidOut = false;

	function applyLayout(): void {
		const resolved = resolveWebPreviewModeWithHysteresis(
			{
				webPreviewMode: settings.webPreviewMode,
				designWidth,
				designHeight,
				fitThresholdScale: settings.fitThresholdScale,
				fitMinScale: settings.fitMinScale,
				containerWidth,
				containerHeight,
			},
			resolvedMode,
			resolvedFitKind,
		);
		// A transition only reads as motion when both frames were already in the
		// fit path; entering it should snap.
		const animate = hasLaidOut && resolvedMode === 'fit' && resolved.mode === 'fit';
		resolvedMode = resolved.mode;
		resolvedFitKind = resolved.fitKind;
		hasLaidOut = true;

		if (resolved.mode === 'responsive') {
			stage.style.cssText = 'position:relative;width:100%;height:100%';
			frame.style.cssText = 'position:relative;width:100%;height:100%';
			// `cq*` units are resolved against the view's own box, so `rpx`, `vw`
			// and `vh` inside the Lynx page track the panel.
			applyViewStyle({
				width: '100%',
				height: '100%',
				'container-type': 'size',
				'--rpx-unit': `calc(100cqw / ${RPX_BASELINE})`,
				'--vh-unit': '1cqh',
				'--vw-unit': '1cqw',
			});
			return;
		}

		// Fit: a zero-size anchor at the centre, with the design-sized frame
		// translated back by half its scaled size.
		const scale = fitScale(resolved.ratioW, resolved.ratioH, resolved);
		const { offsetX, offsetY } = computeFrameOffset({
			baseWidth: designWidth,
			baseHeight: designHeight,
			scale,
			ax: 0.5,
			ay: 0.5,
		});
		stage.style.cssText = 'position:relative;width:0;height:0;overflow:visible';
		frame.style.cssText =
			`position:absolute;transform-origin:top left;width:${designWidth}px;height:${designHeight}px;` +
			`transform:translate(${offsetX}px, ${offsetY}px) scale(${scale});` +
			(animate ? 'transition:transform 0.2s ease' : '');
		applyViewStyle({
			width: `${designWidth}px`,
			height: `${designHeight}px`,
			'container-type': 'size',
			'--rpx-unit': `${designWidth / RPX_BASELINE}px`,
			'--vh-unit': `${designHeight / 100}px`,
			'--vw-unit': `${designWidth / 100}px`,
		});
	}

	/**
	 * Style the view one property at a time, never through `cssText`.
	 *
	 * web-core's stylesheet declares `lynx-view { display: none }` and reveals
	 * the element with an inline style of its own once the page is up. Assigning
	 * `cssText` here replaces the whole attribute, so a resize would silently
	 * take that `display` away and collapse the preview to zero width.
	 */
	function applyViewStyle(declarations: Record<string, string>): void {
		if (!view) return;
		for (const [property, value] of Object.entries(declarations)) {
			view.style.setProperty(property, value);
		}
	}

	function fitScale(
		ratioW: number,
		ratioH: number,
		resolved: {
			fitKind: ResolvedWebPreviewFitKind;
			enterThresholdScale: number;
			enterMinScale: number;
		},
	): number {
		if (!isFinitePositive(containerWidth) || !isFinitePositive(containerHeight)) return 0;
		const range = computeScaleRange({
			containerWidth,
			containerHeight,
			baseWidth: designWidth,
			baseHeight: designHeight,
		});
		if (!Number.isFinite(range.contain) || !isFinitePositive(range.cover)) return 0;

		if (settings.fit === 'contain') return range.contain;
		if (settings.fit === 'cover') return range.cover;

		// `auto`: lean to cover while the crop stays small, and toward contain as
		// it grows, so a slightly-too-narrow panel fills instead of letterboxing
		// but a very wrong aspect ratio does not eat the example.
		const MAX_CROP_RATIO = 0.5;
		const COVER_BIAS_EXPONENT = 2;
		const cropRatio = 1 - range.contain / range.cover;
		const normalizedCrop = clamp01(cropRatio / MAX_CROP_RATIO);
		let progress = 1 - normalizedCrop ** COVER_BIAS_EXPONENT;

		const biases = autoFitBiases(ratioW, ratioH, resolved);
		progress = progress * (1 - biases.containPull);
		progress = progress + (1 - progress) * biases.coverPush;

		let scale = lerpFitScale(range, progress);
		// Below this the example stops being readable at all, at which point
		// cropping beats shrinking further.
		const minReadableWidth = Math.max(180, Math.round(designWidth * 0.58));
		const minReadableHeight = Math.max(220, Math.round(designHeight * 0.36));
		const floor = Math.max(minReadableWidth / designWidth, minReadableHeight / designHeight);
		if (
			(containerWidth < minReadableWidth || containerHeight < minReadableHeight) &&
			scale < floor
		) {
			scale = Math.max(range.cover, floor);
		}
		return scale;
	}

	function autoFitBiases(
		ratioW: number,
		ratioH: number,
		resolved: {
			fitKind: ResolvedWebPreviewFitKind;
			enterThresholdScale: number;
			enterMinScale: number;
		},
	): { containPull: number; coverPush: number } {
		const none = { containPull: 0, coverPush: 0 };
		if (settings.webPreviewMode !== 'auto' || settings.fit !== 'auto') return none;
		if (!Number.isFinite(ratioW) || !Number.isFinite(ratioH)) return none;
		const { enterThresholdScale, enterMinScale } = resolved;
		if (!isFinitePositive(enterThresholdScale) || !isFinitePositive(enterMinScale)) return none;

		if (resolved.fitKind === 'width') {
			const extreme = Math.max(enterMinScale, enterThresholdScale * 0.62);
			const range = enterThresholdScale - extreme;
			if (range <= 0) return none;
			// Shape the response as cover plateau → contain window → cover plateau,
			// so the panel neither letterboxes early nor crops on the way down.
			const narrowness = clamp01((enterThresholdScale - ratioW) / range);
			const leftCover = 1 - smoothstep01((narrowness - 0.18) / 0.48);
			const midContain =
				smoothstep01((narrowness - 0.4) / 0.14) * (1 - smoothstep01((narrowness - 0.62) / 0.14));
			const rightCover = smoothstep01((narrowness - 0.76) / 0.12);
			const coverPlateau = Math.max(leftCover, rightCover);
			return {
				containPull: midContain * (1 - coverPlateau) * 0.45,
				coverPush: coverPlateau * 0.98,
			};
		}

		if (resolved.fitKind === 'height') {
			// Wide but slightly short: contain rather than fill the width.
			const widthSupport = smoothstep01(
				(ratioW - enterThresholdScale * 0.98) / (enterThresholdScale * 0.22),
			);
			const shortness = smoothstep01((enterMinScale - ratioH) / (enterMinScale * 0.5));
			return { containPull: widthSupport * shortness * 0.45, coverPush: 0 };
		}

		return none;
	}

	function measure(): void {
		const box = container.getBoundingClientRect();
		containerWidth = box.width;
		containerHeight = box.height;
	}

	const resizeObserver =
		typeof ResizeObserver === 'undefined'
			? undefined
			: new ResizeObserver(() => {
					measure();
					applyLayout();
					initializeBrowserConfig();
					scheduleViewportResync();
				});
	resizeObserver?.observe(container);
	measure();
	applyLayout();

	/**
	 * Set once, before `url`. web-core reads it when it builds the page, and a
	 * later assignment does not re-lay-out an already-rendered page — go-web
	 * pins it the same way.
	 */
	function initializeBrowserConfig(): void {
		if (!view || browserConfigInitialized) return;
		const usesFit = resolvedMode === 'fit';
		const width = usesFit ? designWidth : containerWidth;
		const height = usesFit ? designHeight : containerHeight;
		if (!isFinitePositive(width) || !isFinitePositive(height)) return;
		const pixelRatio = window.devicePixelRatio || 1;
		view.browserConfig = {
			pixelWidth: Math.round(width * pixelRatio),
			pixelHeight: Math.round(height * pixelRatio),
			pixelRatio,
		};
		browserConfigInitialized = true;
	}

	function fail(reason: unknown): void {
		publish({ error: formatError(reason) ?? 'The Lynx runtime reported an error.' });
	}

	/**
	 * The *live* page root.
	 *
	 * A reload does not replace the old root in place — web-core marks it
	 * `l-disposed` and builds the new page beside it, so the torn-down node stays
	 * in the shadow tree and is the first match for the selector. Taking the
	 * first match (as go-web does) therefore never observes the rebuilt page and
	 * a refresh can only ever end on the fallback timeout.
	 */
	function pageRoot(): Element | null {
		const roots = view?.shadowRoot?.querySelectorAll('[part="page"], [lynx-tag="page"]');
		for (const root of roots ?? []) {
			if (!root.hasAttribute(DISPOSED_ATTRIBUTE)) return root;
		}
		return null;
	}

	/**
	 * Early shadow chrome is an iframe and an empty blob stylesheet; a non-empty
	 * `<style>` only lands once the template has been decoded. That is the only
	 * observable boundary between "downloading" and "rendering" — the bundle is
	 * fetched inside a worker, where a document PerformanceObserver cannot see it.
	 */
	function hasDecodedTemplate(shadow: ShadowRoot): boolean {
		return [...shadow.querySelectorAll('style')].some(
			(element) => (element.textContent ?? '').trim().length > 0,
		);
	}

	function evaluateShadow(shadow: ShadowRoot): void {
		if (disposed || state.rendered) return;
		const page = pageRoot();
		// Once the pre-reload root has been marked torn down it is no longer
		// something a new root could be confused with, so stop holding it against
		// the identity test.
		if (previousPage?.hasAttribute(DISPOSED_ATTRIBUTE)) previousPage = null;
		if (page && page !== previousPage) {
			renderObserver?.disconnect();
			// Double rAF: uncover only after the browser has actually painted the
			// page, so the overlay never lifts onto a blank frame.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					publish({ rendered: true, stage: 'rendered', canRefresh: true });
					startAutoGesture();
				});
			});
			return;
		}
		// Either signal means the bundle itself has arrived, which is what makes a
		// soft reload cheap and therefore worth offering.
		if (state.stage === 'downloading' && hasDecodedTemplate(shadow)) {
			publish({ stage: 'rendering', canRefresh: true });
		}
	}

	function watchShadow(): void {
		if (disposed || !view) return;
		const shadow = view.shadowRoot;
		if (!shadow) {
			shadowPoll = requestAnimationFrame(watchShadow);
			return;
		}
		renderObserver = new MutationObserver(() => evaluateShadow(shadow));
		renderObserver.observe(shadow, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: [DISPOSED_ATTRIBUTE],
		});
		evaluateShadow(shadow);
	}

	/** Create the element, configure it, and point it at the bundle. */
	function startView(): void {
		if (disposed) return;
		publish({ ready: true, rendered: false, stage: 'downloading', error: null });

		view = document.createElement('lynx-view') as LynxViewElement;
		view.setAttribute('lynx-group-id', String(settings.groupId));
		view.setAttribute('transform-vh', '');
		view.setAttribute('transform-vw', '');
		view.addEventListener('error', (event: Event) => {
			const detail = (event as CustomEvent<{ error?: unknown; message?: unknown }>).detail;
			fail(detail?.error ?? detail?.message ?? event);
		});
		browserConfigInitialized = false;
		previousPage = null;
		frame.append(view);
		applyLayout();
		initializeBrowserConfig();
		view.setAttribute('url', url);

		builtWidth = Math.round(containerWidth);
		builtHeight = Math.round(containerHeight);

		watchShadow();
		armRenderTimeout();
	}

	loadRuntime().then(startView, fail);

	/**
	 * Rebuild the page when the panel has settled at a new size.
	 *
	 * `browserConfig` is read once, when web-core builds the page, and assigning
	 * it later does not re-lay-out — go-web pins it the same way. So after a
	 * resize the Lynx page is still laid out for the old viewport: an example
	 * that derives anything from `SystemInfo` (the swiper's slide width, the
	 * gallery's column width) keeps the stale value and drifts out of alignment
	 * with the box it is drawn in. Rebuilding is the only way to re-seed it, and
	 * the bundle is cached, so it costs a rebuild rather than a download.
	 *
	 * Debounced, or dragging the split would restart the example every frame.
	 */
	function scheduleViewportResync(): void {
		if (disposed || !view || builtWidth === 0) return;
		if (Math.round(containerWidth) === builtWidth && Math.round(containerHeight) === builtHeight) {
			return;
		}
		if (resyncTimer) clearTimeout(resyncTimer);
		resyncTimer = setTimeout(() => {
			if (disposed || !view) return;
			if (
				Math.round(containerWidth) === builtWidth &&
				Math.round(containerHeight) === builtHeight
			) {
				return;
			}
			handle.reload();
		}, VIEWPORT_RESYNC_MS);
	}

	/** Uncover the preview even if the page signal never arrives. */
	function armRenderTimeout(): void {
		if (renderTimeout) clearTimeout(renderTimeout);
		renderTimeout = setTimeout(() => {
			publish({ rendered: true, stage: 'rendered', canRefresh: true });
			startAutoGesture();
		}, settings.renderTimeoutMs);
	}

	/** Only after the page has painted: a gesture into a blank view demonstrates nothing. */
	function startAutoGesture(): void {
		if (disposed || gesture || !view || !settings.autoGesture) return;
		gesture = playAutoGesture(view, settings.autoGesture);
	}

	function stopAutoGesture(): void {
		gesture?.stop();
		gesture = undefined;
	}

	const handle: LynxViewHandle = {
		/**
		 * Rebuild the page.
		 *
		 * go-web calls `<lynx-view>.reload()` for this, but on web-core 0.22.2
		 * that tears the page down without building a new one: the root keeps its
		 * identity, gains `l-disposed`, and nothing replaces it — so the preview
		 * is left showing a dead tree until the fallback timeout gives up. A fresh
		 * element rebuilds deterministically, and the bundle comes from the HTTP
		 * cache, so this costs a rebuild rather than a download.
		 */
		reload(): void {
			if (disposed) return;
			stopAutoGesture();
			renderObserver?.disconnect();
			cancelAnimationFrame(shadowPoll);
			view?.remove();
			view = undefined;
			startView();
		},
		dispose(): void {
			disposed = true;
			stopAutoGesture();
			if (resyncTimer) clearTimeout(resyncTimer);
			resizeObserver?.disconnect();
			renderObserver?.disconnect();
			cancelAnimationFrame(shadowPoll);
			if (renderTimeout) clearTimeout(renderTimeout);
			view?.remove();
			inner.remove();
		},
	};
	return handle;
}

function omitUndefined<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as Partial<T>;
}

function formatError(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === 'string') return value;
	if (value instanceof Error) return value.message || value.name;
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (typeof record.message === 'string' && record.message) return record.message;
		const nested = formatError(record.error);
		if (nested) return nested;
		const parts: string[] = [];
		if (typeof record.name === 'string' && record.name) parts.push(record.name);
		if (typeof record.code === 'string' || typeof record.code === 'number') {
			parts.push(`code: ${String(record.code)}`);
		}
		if (parts.length > 0) return parts.join(' ');
		return null;
	}
	return String(value);
}
