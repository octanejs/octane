// Copyright 2024–2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0.
// Adapted for an Octane-owned, module-scoped renderer contract.

/**
 * Renderer-owned compatibility slice adapted from `@lynx-js/types@4.0.0`.
 *
 * The upstream `props` entry imports `events`, and `events` imports the
 * main-thread `Element` graph. That graph globally augments JSX, so merely
 * importing otherwise useful event types mutates React's intrinsic namespace.
 * Keep the dependency pinned for provenance, but expose only these local,
 * module-scoped shapes until upstream provides a side-effect-free type entry.
 */

export interface LynxEventTarget {
	id: string;
	uid: number;
	dataset: { [key: string]: any };
}

export interface LynxEvent<Kind = string, Detail = any> {
	type: Kind;
	timestamp: number;
	target: LynxEventTarget;
	currentTarget: LynxEventTarget;
	detail: Detail;
}

export interface LynxDispatchEvent<Kind = string, Detail = any> extends LynxEvent<Kind, Detail> {
	preventDefault(): void;
	stopPropagation(): void;
}

export interface LynxEventInstance {
	querySelector(...params: any[]): any;
	querySelectorAll(...params: any[]): any;
	requestAnimationFrame(...params: any[]): any;
	cancelAnimationFrame(...params: any[]): any;
	triggerEvent(...params: any[]): any;
	getStore(...params: any[]): any;
	setStore(...params: any[]): any;
	getData(...params: any[]): any;
	setData(...params: any[]): any;
	getProperties(...params: any[]): any;
}

export type LynxEventHandler<Event> = (event: Event, instance?: LynxEventInstance) => void;

export interface LynxTouch {
	identifier: number;
	x: number;
	y: number;
	pageX: number;
	pageY: number;
	clientX: number;
	clientY: number;
}

export interface LynxTouchEvent extends LynxDispatchEvent<string, { x: number; y: number }> {
	touches: LynxTouch[];
	changedTouches: LynxTouch[];
}

export interface LynxMouseEvent extends LynxDispatchEvent<string, Record<string, never>> {
	button: number;
	buttons: number;
	scale: number;
	x: number;
	y: number;
	pageX: number;
	pageY: number;
	clientX: number;
	clientY: number;
}

export interface LynxWheelEvent extends LynxDispatchEvent<string, Record<string, never>> {
	x: number;
	y: number;
	pageX: number;
	pageY: number;
	clientX: number;
	clientY: number;
	deltaX: number;
	deltaY: number;
}

export interface LynxKeyEvent extends LynxDispatchEvent<string, Record<string, never>> {
	key: string;
}

export interface LynxAnimationEvent extends LynxDispatchEvent<string, Record<string, never>> {
	params: {
		animation_type: 'keyframe-animation';
		animation_name: string;
		new_animator?: true;
	};
}

export interface LynxTransitionEvent extends LynxDispatchEvent<string, Record<string, never>> {
	params:
		| {
				animation_type: 'transition-animation';
				animation_name:
					| 'width'
					| 'height'
					| 'left'
					| 'top'
					| 'right'
					| 'bottom'
					| 'background-color'
					| 'opacity';
				new_animator: true;
		  }
		| {
				animation_type:
					| 'transition-width'
					| 'transition-height'
					| 'transition-left'
					| 'transition-top'
					| 'transition-right'
					| 'transition-bottom'
					| 'transition-transform'
					| 'transition-background-color'
					| 'transition-opacity';
				animation_name: undefined;
				new_animator: undefined;
		  };
}

export interface LynxImageLoadEvent extends LynxDispatchEvent<string, Record<string, never>> {
	width: number;
	height: number;
	load_start?: number;
	load_finish?: number;
	cost?: number;
	src?: string;
	view_width?: number;
	view_height?: number;
	memory_cost?: number;
	origin?: number;
}

export interface LynxImageErrorEvent extends LynxDispatchEvent<string, Record<string, never>> {
	errMsg: string;
	error_code: number;
	lynx_categorized_code: number;
}

export interface LynxLayoutChangeEvent extends LynxDispatchEvent<
	'layoutchange',
	LynxLayoutBounds & { id: string; dataset: { [key: string]: any } }
> {
	params: LynxLayoutBounds;
}

export interface LynxLayoutBounds {
	width: number;
	height: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface LynxAppearanceEvent extends LynxDispatchEvent<
	'uiappear' | 'uidisappear',
	{
		'exposure-id': string;
		'exposure-scene': string;
		'unique-id': string;
		dataset: { [key: string]: any };
	}
> {}

export interface LynxAccessibilityActionEvent extends LynxDispatchEvent<string, { name: string }> {}

type LynxEventPrefix = 'bind' | 'catch' | 'capture-bind' | 'capture-catch' | 'global-bind';
type LynxPrefixedEvent<Name extends string, Event> = {
	[Property in `${LynxEventPrefix}${Name}`]?: LynxEventHandler<Event>;
};

export type LynxStandardEventProps = LynxPrefixedEvent<'bgload', LynxImageLoadEvent> &
	LynxPrefixedEvent<'bgerror', LynxImageErrorEvent> &
	LynxPrefixedEvent<'touchstart', LynxTouchEvent> &
	LynxPrefixedEvent<'touchmove', LynxTouchEvent> &
	LynxPrefixedEvent<'touchcancel', LynxTouchEvent> &
	LynxPrefixedEvent<'touchend', LynxTouchEvent> &
	LynxPrefixedEvent<'longpress', LynxTouchEvent> &
	LynxPrefixedEvent<'transitionstart', LynxTransitionEvent> &
	LynxPrefixedEvent<'transitioncancel', LynxTransitionEvent> &
	LynxPrefixedEvent<'transitionend', LynxTransitionEvent> &
	LynxPrefixedEvent<'animationstart', LynxAnimationEvent> &
	LynxPrefixedEvent<'animationiteration', LynxAnimationEvent> &
	LynxPrefixedEvent<'animationcancel', LynxAnimationEvent> &
	LynxPrefixedEvent<'animationend', LynxAnimationEvent> &
	LynxPrefixedEvent<'mousedown', LynxMouseEvent> &
	LynxPrefixedEvent<'mouseup', LynxMouseEvent> &
	LynxPrefixedEvent<'mousemove', LynxMouseEvent> &
	LynxPrefixedEvent<'mouseenter', LynxMouseEvent> &
	LynxPrefixedEvent<'mouseleave', LynxMouseEvent> &
	LynxPrefixedEvent<'mouseclick', LynxMouseEvent> &
	LynxPrefixedEvent<'mousedblclick', LynxMouseEvent> &
	LynxPrefixedEvent<'mouselongpress', LynxMouseEvent> &
	LynxPrefixedEvent<'wheel', LynxWheelEvent> &
	LynxPrefixedEvent<'zoom', LynxMouseEvent> &
	LynxPrefixedEvent<'keydown', LynxKeyEvent> &
	LynxPrefixedEvent<'keyup', LynxKeyEvent> &
	LynxPrefixedEvent<'focus', LynxDispatchEvent> &
	LynxPrefixedEvent<'blur', LynxDispatchEvent> &
	LynxPrefixedEvent<'layoutchange', LynxLayoutChangeEvent> &
	LynxPrefixedEvent<'uiappear', LynxAppearanceEvent> &
	LynxPrefixedEvent<'uidisappear', LynxAppearanceEvent> &
	LynxPrefixedEvent<'accessibilityaction', LynxAccessibilityActionEvent> &
	LynxPrefixedEvent<'tap', LynxTouchEvent> &
	LynxPrefixedEvent<'longtap', LynxTouchEvent>;

export interface LynxStyleProperties {
	[property: string]: string | number | boolean | null | undefined;
}

export type LynxStandardProps = LynxStandardEventProps & {
	id?: string;
	className?: string;
	class?: string;
	hidden?: boolean;
	animation?: { actions: Record<string, unknown>[] };
	flatten?: boolean;
	name?: string;
	overlap?: boolean;
	'overlap-ios'?: boolean;
	enableLayoutOnly?: boolean;
	cssAlignWithLegacyW3C?: boolean;
	'accessibility-label'?: string;
	'accessibility-traits'?:
		| 'text'
		| 'image'
		| 'button'
		| 'link'
		| 'header'
		| 'search'
		| 'selected'
		| 'playable'
		| 'keyboard'
		| 'summary'
		| 'disabled'
		| 'updating'
		| 'adjustable'
		| 'tabbar'
		| 'none';
	'accessibility-element'?: boolean;
	'accessibility-value'?: string;
	'accessibility-heading'?: boolean;
	'accessibility-role-description'?: string;
	'accessibility-actions'?: string[];
	'accessibility-elements-hidden'?: boolean;
	'accessibility-exclusive-focus'?: boolean;
	'ios-platform-accessibility-id'?: string;
	focusable?: boolean;
	'focus-index'?: string;
	'next-focus-up'?: string;
	'next-focus-down'?: string;
	'next-focus-left'?: string;
	'next-focus-right'?: string;
	__lynx_timing_flag?: string;
	style?: string | LynxStyleProperties;
	'ios-background-shape-layer'?: boolean;
	'exposure-id'?: string;
	'exposure-scene'?: string;
	'exposure-screen-margin-top'?: `${number}px` | `${number}rpx`;
	'exposure-screen-margin-right'?: `${number}px` | `${number}rpx`;
	'exposure-screen-margin-bottom'?: `${number}px` | `${number}rpx`;
	'exposure-screen-margin-left'?: `${number}px` | `${number}rpx`;
	'exposure-ui-margin-top'?: `${number}px` | `${number}rpx`;
	'exposure-ui-margin-right'?: `${number}px` | `${number}rpx`;
	'exposure-ui-margin-bottom'?: `${number}px` | `${number}rpx`;
	'exposure-ui-margin-left'?: `${number}px` | `${number}rpx`;
	'exposure-area'?: `${number}%`;
	'enable-exposure-ui-margin'?: boolean;
	'enable-exposure-ui-clip'?: boolean;
	'user-interaction-enabled'?: boolean;
	'native-interaction-enabled'?: boolean;
	'block-native-event'?: boolean;
	'block-native-event-areas'?: [
		`${number}px` | `${number}%`,
		`${number}px` | `${number}%`,
		`${number}px` | `${number}%`,
		`${number}px` | `${number}%`,
	][];
	'consume-slide-event'?: [number, number][];
	'event-through'?: boolean;
	'enable-touch-pseudo-propagation'?: boolean;
	'hit-slop'?:
		| `${number}px`
		| {
				top: `${number}px`;
				left: `${number}px`;
				right: `${number}px`;
				bottom: `${number}px`;
		  };
	'ignore-focus'?: boolean;
	'ios-enable-simultaneous-touch'?: boolean;
	'event-through-active-regions'?: [
		`${number}%` | `${number}px`,
		`${number}%` | `${number}px`,
		`${number}%` | `${number}px`,
		`${number}%` | `${number}px`,
	][];
};
