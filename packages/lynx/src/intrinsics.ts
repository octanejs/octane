import type {
	LynxEvent as NativeLynxEvent,
	LynxEventHandler as NativeLynxEventHandler,
	LynxEventTarget as NativeLynxEventTarget,
	LynxImageErrorEvent,
	LynxImageLoadEvent,
	LynxStandardProps as NativeLynxStandardProps,
} from './native-types.js';
import type { LynxPublicHandle } from './core/client-driver.js';
import type {
	LynxMainThreadRefDescriptor,
	LynxMainThreadWorkletDescriptor,
} from './core/worklets.js';

/**
 * Renderer-local adaptation of the first Lynx intrinsic slice.
 *
 * Upstream's props/events entry transitively imports its global Element graph,
 * so this module uses the renderer-owned, module-scoped compatibility slice in
 * native-types.ts.
 */

export type LynxRefCallback<T = LynxPublicHandle> = (value: T | null) => void | (() => void);
export type LynxRefObject<T = LynxPublicHandle> = { current: T | null };
export type LynxRef<T = LynxPublicHandle> =
	LynxRefCallback<T> | LynxRefObject<T> | readonly LynxRef<T>[];

type LynxMainThreadEventPrefix =
	'bind' | 'catch' | 'capture-bind' | 'capture-catch' | 'global-bind';

export type LynxMainThreadEventHandler<Event = LynxEvent> =
	((event: Event) => unknown) | LynxMainThreadWorkletDescriptor;

export type LynxMainThreadEventProps = {
	[Property in `main-thread:${LynxMainThreadEventPrefix}${string}`]?: LynxMainThreadEventHandler;
};

export type LynxStandardProps = NativeLynxStandardProps &
	LynxMainThreadEventProps & {
		ref?: LynxRef;
		'main-thread:ref'?: LynxMainThreadRefDescriptor;
	};
export type LynxEventTarget = NativeLynxEventTarget;
export type LynxEvent<Kind extends string = string, Detail = unknown> = NativeLynxEvent<
	Kind,
	Detail
>;
export type LynxEventHandler<Event> = NativeLynxEventHandler<Event>;

export type LynxPageProps = LynxStandardProps;

export type LynxViewProps = LynxStandardProps;

export type LynxTextProps = LynxStandardProps & {
	'text-maxline'?: string;
	'text-maxlength'?: string;
	'text-single-line-vertical-align'?: 'normal' | 'bottom' | 'center' | 'top';
	'include-font-padding'?: boolean;
	'text-selection'?: boolean;
};

export type LynxRawTextProps = {
	text: number | string;
	ref?: LynxRef;
};

export type LynxImageProps = LynxStandardProps & {
	src?: string;
	mode?: 'scaleToFill' | 'aspectFit' | 'aspectFill' | 'center';
	placeholder?: string;
	'blur-radius'?: string;
	'cap-insets'?: string;
	'cap-insets-scale'?: number;
	'loop-count'?: number;
	'auto-size'?: boolean;
	autoplay?: boolean;
	'tint-color'?: string;
	bindload?: LynxEventHandler<LynxImageLoadEvent>;
	binderror?: LynxEventHandler<LynxImageErrorEvent>;
};

export interface LynxScrollInfo {
	scrollTop: number;
	scrollLeft: number;
	scrollHeight: number;
	scrollWidth: number;
	deltaX: number;
	deltaY: number;
}

export type LynxScrollEvent = LynxEvent<'scroll', LynxScrollInfo>;
export type LynxScrollEndEvent = LynxEvent<'scrollend', LynxScrollInfo>;
export type LynxScrollToLowerEvent = LynxEvent<'scrolltolower', LynxScrollInfo>;
export type LynxScrollToUpperEvent = LynxEvent<'scrolltoupper', LynxScrollInfo>;
export type LynxContentSizeChangedEvent = LynxEvent<'contentsizechanged', LynxScrollInfo>;

export type LynxScrollViewProps = LynxStandardProps & {
	'scroll-orientation'?: 'vertical' | 'horizontal';
	bounces?: boolean;
	'enable-scroll'?: boolean;
	'scroll-bar-enable'?: boolean;
	'upper-threshold'?: number;
	'lower-threshold'?: number;
	'initial-scroll-offset'?: number;
	'initial-scroll-to-index'?: number;
	bindscrolltoupper?: LynxEventHandler<LynxScrollToUpperEvent>;
	bindscrolltolower?: LynxEventHandler<LynxScrollToLowerEvent>;
	bindscroll?: LynxEventHandler<LynxScrollEvent>;
	bindscrollend?: LynxEventHandler<LynxScrollEndEvent>;
	bindcontentsizechanged?: LynxEventHandler<LynxContentSizeChangedEvent>;
};

export interface LynxValueEventDetail {
	value: string;
}

export interface LynxInputEventDetail extends LynxValueEventDetail {
	selectionStart: number;
	selectionEnd: number;
	isComposing?: boolean;
}

export interface LynxSelectionEventDetail {
	selectionStart: number;
	selectionEnd: number;
}

export type LynxFocusEvent = LynxEvent<'bindfocus', LynxValueEventDetail>;
export type LynxBlurEvent = LynxEvent<'bindblur', LynxValueEventDetail>;
export type LynxConfirmEvent = LynxEvent<'bindconfirm', LynxValueEventDetail>;
export type LynxInputEvent = LynxEvent<'bindinput', LynxInputEventDetail>;
export type LynxSelectionEvent = LynxEvent<'bindselection', LynxSelectionEventDetail>;

export type LynxInputProps = Omit<LynxStandardProps, 'bindfocus' | 'bindblur'> & {
	placeholder?: string;
	'confirm-type'?: 'send' | 'search' | 'go' | 'done' | 'next';
	maxlength?: number;
	readonly?: boolean;
	disabled?: boolean;
	'show-soft-input-on-focus'?: boolean;
	'input-filter'?: string;
	type?: 'text' | 'number' | 'digit' | 'password' | 'tel' | 'email';
	bindfocus?: LynxEventHandler<LynxFocusEvent>;
	bindblur?: LynxEventHandler<LynxBlurEvent>;
	bindconfirm?: LynxEventHandler<LynxConfirmEvent>;
	bindinput?: LynxEventHandler<LynxInputEvent>;
	bindselection?: LynxEventHandler<LynxSelectionEvent>;
};

export type LynxTextAreaProps = Omit<LynxStandardProps, 'bindfocus' | 'bindblur'> & {
	placeholder?: string;
	'confirm-type'?: 'send' | 'search' | 'go' | 'done' | 'next';
	maxlength?: number;
	maxlines?: number;
	bounces?: boolean;
	'line-spacing'?: number | `${number}px` | `${number}rpx`;
	readonly?: boolean;
	disabled?: boolean;
	'show-soft-input-on-focus'?: boolean;
	'input-filter'?: string;
	'enable-scroll-bar'?: boolean;
	type?: 'text' | 'number' | 'digit' | 'tel' | 'email';
	bindfocus?: LynxEventHandler<LynxFocusEvent>;
	bindblur?: LynxEventHandler<LynxBlurEvent>;
	bindinput?: LynxEventHandler<LynxInputEvent>;
	bindselection?: LynxEventHandler<LynxSelectionEvent>;
	bindconfirm?: LynxEventHandler<LynxConfirmEvent>;
};

export type LynxListScrollState = 1 | 2 | 3 | 4;
export type LynxListEventSource = 0 | 1 | 2;
export type LynxListSearchRefAnchorStrategy = 0 | 1 | 2;

export interface LynxListAttachedCell {
	id: string;
	itemKey: string;
	index: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface LynxListScrollInfo extends LynxScrollInfo {
	listWidth: number;
	listHeight: number;
	eventSource: LynxListEventSource;
	attachedCells: LynxListAttachedCell[];
}

export interface LynxListItemSnapAlignment {
	factor: number;
	offset: number;
}

export interface LynxListScrollStateInfo {
	state: LynxListScrollState;
}

export interface LynxListSnapInfo {
	position: number;
	currentScrollLeft: number;
	currentScrollTop: number;
	targetScrollLeft: number;
	targetScrollTop: number;
}

export interface LynxListLayoutCompleteInfo {
	'layout-id'?: number;
	scrollInfo: LynxListScrollInfo;
}

export type LynxListScrollEvent = LynxEvent<'scroll', LynxListScrollInfo>;
export type LynxListScrollToLowerEvent = LynxEvent<'scrolltolower', LynxListScrollInfo>;
export type LynxListScrollToUpperEvent = LynxEvent<'scrolltoupper', LynxListScrollInfo>;
export type LynxListScrollStateChangeEvent = LynxEvent<
	'scrollstatechange',
	LynxListScrollStateInfo
>;
export type LynxListLayoutCompleteEvent = LynxEvent<'layoutcomplete', LynxListLayoutCompleteInfo>;
export type LynxListSnapEvent = LynxEvent<'snap', LynxListSnapInfo>;

export type LynxListProps = LynxStandardProps & {
	'scroll-orientation'?: 'vertical' | 'horizontal';
	'span-count'?: number;
	'list-type'?: 'single' | 'flow' | 'waterfall';
	'enable-scroll'?: boolean;
	'enable-nested-scroll'?: boolean;
	sticky?: boolean;
	'sticky-offset'?: number;
	bounces?: boolean;
	'initial-scroll-index'?: number;
	'need-visible-item-info'?: boolean;
	'lower-threshold-item-count'?: number;
	'upper-threshold-item-count'?: number;
	'scroll-event-throttle'?: number;
	'item-snap'?: LynxListItemSnapAlignment;
	'preload-buffer-count'?: number;
	'experimental-search-ref-anchor-strategy'?: LynxListSearchRefAnchorStrategy;
	'scroll-bar-enable'?: boolean;
	'need-layout-complete-info'?: boolean;
	'layout-id'?: number;
	bindscroll?: LynxEventHandler<LynxListScrollEvent>;
	bindscrolltoupper?: LynxEventHandler<LynxListScrollToUpperEvent>;
	bindscrolltolower?: LynxEventHandler<LynxListScrollToLowerEvent>;
	bindscrollstatechange?: LynxEventHandler<LynxListScrollStateChangeEvent>;
	bindlayoutcomplete?: LynxEventHandler<LynxListLayoutCompleteEvent>;
	bindsnap?: LynxEventHandler<LynxListSnapEvent>;
};

export type LynxListItemProps = LynxStandardProps & {
	'item-key': string;
	'sticky-top'?: boolean;
	'sticky-bottom'?: boolean;
	'full-span'?: boolean;
	'estimated-main-axis-size-px'?: number;
	recyclable?: boolean;
	/** Native reuse pool partition; omission or `''` selects the default pool. */
	'reuse-identifier'?: string;
	/**
	 * Forwarded as boolean deferred-item metadata. Physical cell recycling always
	 * retains the logical Octane subtree, including component state and effects;
	 * ReactLynx's `{ unmountRecycled: true }` form is intentionally unsupported.
	 */
	defer?: boolean;
};

/**
 * Consumers register application-owned native elements by augmenting this
 * interface in `@octanejs/lynx/intrinsics`.
 */
export interface LynxCustomIntrinsicElements {}

export interface LynxIntrinsicElements {
	page: LynxPageProps;
	view: LynxViewProps;
	text: LynxTextProps;
	'raw-text': LynxRawTextProps;
	image: LynxImageProps;
	'scroll-view': LynxScrollViewProps;
	input: LynxInputProps;
	textarea: LynxTextAreaProps;
	list: LynxListProps;
	'list-item': LynxListItemProps;
}

export type LynxElements = LynxIntrinsicElements & LynxCustomIntrinsicElements;

/** Renderer-local JSX namespace; no global or React JSX namespace is augmented. */
export namespace JSX {
	export interface IntrinsicElements extends LynxIntrinsicElements, LynxCustomIntrinsicElements {}
}
