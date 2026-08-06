// Choosing between a fixed phone frame and a container-relative one.
//
// Adapted from @lynx-js/go-web (Apache-2.0),
// src/example-preview/utils/resolve-web-preview.ts. See ./UPSTREAM.md.
//
// A preview panel that resizes across the fit/responsive boundary flickers if
// the decision is a bare threshold test, so entering `fit` and leaving it use
// different thresholds. `resolveWebPreviewModeWithHysteresis` is therefore a
// function of the previous decision as well as the current size.

import { isFinitePositive } from './fit.ts';

export type WebPreviewMode = 'fit' | 'responsive' | 'auto';
export type ResolvedWebPreviewMode = Exclude<WebPreviewMode, 'auto'>;
export type ResolvedWebPreviewFitKind = 'width' | 'height' | null;

export type WebPreviewResolveReason =
	| 'explicit_fit'
	| 'explicit_responsive'
	| 'invalid_dims'
	| 'invalid_thresholds'
	| 'width_bound'
	| 'height_bound'
	| 'hysteresis_hold'
	| 'none';

export interface ResolveWebPreviewModeArgs {
	webPreviewMode: WebPreviewMode;
	designWidth: number;
	designHeight: number;
	fitThresholdScale: number;
	fitMinScale: number;
	containerWidth: number;
	containerHeight: number;
}

export interface ResolvedWebPreview {
	mode: ResolvedWebPreviewMode;
	reason: WebPreviewResolveReason;
	fitKind: ResolvedWebPreviewFitKind;
	ratioW: number;
	ratioH: number;
	enterThresholdScale: number;
	enterMinScale: number;
}

/** How much wider than the enter threshold the container must get to leave `fit`. */
const AUTO_HYSTERESIS_FACTOR = 1.06;

function fitReasonFor(widthBound: boolean, heightBound: boolean): WebPreviewResolveReason | null {
	if (widthBound) return 'width_bound';
	if (heightBound) return 'height_bound';
	return null;
}

export function resolveWebPreviewMode(args: ResolveWebPreviewModeArgs): {
	mode: ResolvedWebPreviewMode;
	reason: WebPreviewResolveReason;
} {
	const {
		webPreviewMode,
		designWidth,
		designHeight,
		fitThresholdScale,
		fitMinScale,
		containerWidth,
		containerHeight,
	} = args;

	if (webPreviewMode === 'fit') return { mode: 'fit', reason: 'explicit_fit' };
	if (webPreviewMode === 'responsive') {
		return { mode: 'responsive', reason: 'explicit_responsive' };
	}

	if (!isFinitePositive(containerWidth) || !isFinitePositive(containerHeight)) {
		return { mode: 'responsive', reason: 'invalid_dims' };
	}
	if (!isFinitePositive(designWidth) || !isFinitePositive(designHeight)) {
		return { mode: 'responsive', reason: 'invalid_dims' };
	}
	if (!isFinitePositive(fitThresholdScale) || !isFinitePositive(fitMinScale)) {
		return { mode: 'responsive', reason: 'invalid_thresholds' };
	}

	const reason = fitReasonFor(
		containerWidth / designWidth < fitThresholdScale,
		containerHeight / designHeight < fitMinScale,
	);
	return reason === null ? { mode: 'responsive', reason: 'none' } : { mode: 'fit', reason };
}

export function resolveWebPreviewModeWithHysteresis(
	args: ResolveWebPreviewModeArgs,
	previousMode: ResolvedWebPreviewMode,
	previousFitKind: ResolvedWebPreviewFitKind,
): ResolvedWebPreview {
	const base = resolveWebPreviewMode(args);
	const hasDesignSize = isFinitePositive(args.designWidth) && isFinitePositive(args.designHeight);

	// An explicit choice, or dimensions we cannot reason about, settle it: there
	// is no boundary to hold on either side.
	if (
		base.reason === 'invalid_dims' ||
		base.reason === 'invalid_thresholds' ||
		base.reason === 'explicit_fit' ||
		base.reason === 'explicit_responsive'
	) {
		return {
			mode: base.mode,
			reason: base.reason,
			fitKind: null,
			ratioW: hasDesignSize ? args.containerWidth / args.designWidth : 0,
			ratioH: hasDesignSize ? args.containerHeight / args.designHeight : 0,
			enterThresholdScale: args.fitThresholdScale,
			enterMinScale: args.fitMinScale,
		};
	}

	const ratioW = args.containerWidth / args.designWidth;
	const ratioH = args.containerHeight / args.designHeight;
	const enterThresholdScale = args.fitThresholdScale;
	const enterMinScale = args.fitMinScale;
	const exitThresholdScale = enterThresholdScale * AUTO_HYSTERESIS_FACTOR;
	const exitMinScale = enterMinScale * AUTO_HYSTERESIS_FACTOR;

	const enterReason = fitReasonFor(ratioW < enterThresholdScale, ratioH < enterMinScale);
	const shouldEnterFit = enterReason !== null;
	const shouldLeaveFit = ratioW >= exitThresholdScale && ratioH >= exitMinScale;

	const mode: ResolvedWebPreviewMode =
		previousMode === 'fit'
			? shouldLeaveFit
				? 'responsive'
				: 'fit'
			: shouldEnterFit
				? 'fit'
				: 'responsive';

	const reason: WebPreviewResolveReason =
		mode === 'responsive' ? 'none' : (enterReason ?? 'hysteresis_hold');

	return {
		mode,
		reason,
		fitKind:
			reason === 'width_bound'
				? 'width'
				: reason === 'height_bound'
					? 'height'
					: reason === 'hysteresis_hold'
						? previousFitKind
						: null,
		ratioW,
		ratioH,
		enterThresholdScale,
		enterMinScale,
	};
}
