// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useFocusVisible.ts).
// octane adaptations:
// - React's KeyboardEvent/FocusEvent handler types → native events throughout (module-level
//   listeners already operated on native events upstream).
// - `FOCUS_VISIBLE_INPUT_KEYS` is typed Record<string, boolean> for native `e.key` indexing.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention;
//   `useFocusVisibleListener`'s explicit user deps array is passed through unchanged.

// Portions of the code in this file are based on code from react.
// Original licensing for the following can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/facebook/react/tree/cc7c1aece46a6b69b41958d731e0fd27c94bfc6c/packages/react-interactions

import type { PointerType } from '@react-types/shared';
import { useEffect, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { getActiveElement, getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getOwnerDocument, getOwnerWindow } from '../utils/domHelpers';
import { ignoreFocusEvent } from './utils';
import { isMac } from '../utils/platform';
import { isVirtualClick } from '../utils/isVirtualEvent';
import { openLink } from '../utils/openLink';
import { useIsSSR } from '../ssr/SSRProvider';

export type Modality = 'keyboard' | 'pointer' | 'virtual';
type HandlerEvent = PointerEvent | MouseEvent | KeyboardEvent | FocusEvent | null;
type Handler = (modality: Modality, e: HandlerEvent) => void;
export type FocusVisibleHandler = (isFocusVisible: boolean) => void;
export interface FocusVisibleProps {
	/** Whether the element is a text input. */
	isTextInput?: boolean;
	/** Whether the element will be auto focused. */
	autoFocus?: boolean;
}

export interface FocusVisibleResult {
	/** Whether keyboard focus is visible globally. */
	isFocusVisible: boolean;
}

let currentModality: null | Modality = null;
let currentPointerType: PointerType = 'keyboard';
export const changeHandlers = new Set<Handler>();
interface GlobalListenerData {
	focus: () => void;
}
export let hasSetupGlobalListeners: Map<Window, GlobalListenerData> = new Map<
	Window,
	GlobalListenerData
>(); // We use a map here to support setting event listeners across multiple document objects.
let hasEventBeforeFocus = false;
let hasBlurredWindowRecently = false;

// Only Tab or Esc keys will make focus visible on text input elements
const FOCUS_VISIBLE_INPUT_KEYS: Record<string, boolean> = {
	Tab: true,
	Escape: true,
};

function triggerChangeHandlers(modality: Modality, e: HandlerEvent) {
	for (let handler of changeHandlers) {
		handler(modality, e);
	}
}

/**
 * Helper function to determine if a KeyboardEvent is unmodified and could make keyboard focus
 * styles visible.
 */
function isValidKey(e: KeyboardEvent) {
	// Control and Shift keys trigger when navigating back to the tab with keyboard.
	return !(
		e.metaKey ||
		(!isMac() && e.altKey) ||
		e.ctrlKey ||
		e.key === 'Control' ||
		e.key === 'Shift' ||
		e.key === 'Meta'
	);
}

function handleKeyboardEvent(e: KeyboardEvent) {
	hasEventBeforeFocus = true;
	if (!(openLink as any).isOpening && isValidKey(e)) {
		currentModality = 'keyboard';
		currentPointerType = 'keyboard';
		triggerChangeHandlers('keyboard', e);
	}
}

function handlePointerEvent(e: PointerEvent | MouseEvent) {
	currentModality = 'pointer';
	currentPointerType = 'pointerType' in e ? (e.pointerType as PointerType) : 'mouse';
	if (e.type === 'mousedown' || e.type === 'pointerdown') {
		hasEventBeforeFocus = true;
		triggerChangeHandlers('pointer', e);
	}
}

function handleClickEvent(e: MouseEvent) {
	if (!(openLink as any).isOpening && isVirtualClick(e)) {
		hasEventBeforeFocus = true;
		currentModality = 'virtual';
		currentPointerType = 'virtual';
	}
}

function handleFocusEvent(e: FocusEvent) {
	// Firefox fires two extra focus events when the user first clicks into an iframe:
	// first on the window, then on the document. We ignore these events so they don't
	// cause keyboard focus rings to appear.
	let ownerWindow = getOwnerWindow(getEventTarget(e) as Element);
	let ownerDocument = getOwnerDocument(getEventTarget(e) as Element);
	if (
		getEventTarget(e) === ownerWindow ||
		getEventTarget(e) === ownerDocument ||
		ignoreFocusEvent ||
		!e.isTrusted
	) {
		return;
	}

	// If a focus event occurs without a preceding keyboard or pointer event, switch to virtual modality.
	// This occurs, for example, when navigating a form with the next/previous buttons on iOS.
	if (!hasEventBeforeFocus && !hasBlurredWindowRecently) {
		currentModality = 'virtual';
		currentPointerType = 'virtual';
		triggerChangeHandlers('virtual', e);
	}

	hasEventBeforeFocus = false;
	hasBlurredWindowRecently = false;
}

function handleWindowBlur() {
	if (ignoreFocusEvent) {
		return;
	}

	// When the window is blurred, reset state. This is necessary when tabbing out of the window,
	// for example, since a subsequent focus event won't be fired.
	hasEventBeforeFocus = false;
	hasBlurredWindowRecently = true;
}

/**
 * Setup global event listeners to control when keyboard focus style should be visible.
 */
function setupGlobalFocusEvents(element?: HTMLElement | null) {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return;
	}

	const windowObject = getOwnerWindow(element);
	const documentObject = getOwnerDocument(element);

	if (hasSetupGlobalListeners.get(windowObject)) {
		return;
	}

	// Programmatic focus() calls shouldn't affect the current input modality.
	// However, we need to detect other cases when a focus event occurs without
	// a preceding user event (e.g. screen reader focus). Overriding the focus
	// method on HTMLElement.prototype is a bit hacky, but works.
	// defineProperty (not assignment) so this works even if `focus` is currently
	// a getter-only accessor — e.g. when @testing-library/user-event's setup()
	// has instrumented it. Plain assignment throws in that case.
	let focus = windowObject.HTMLElement.prototype.focus;
	Reflect.defineProperty(windowObject.HTMLElement.prototype, 'focus', {
		configurable: true,
		writable: true,
		value: function (this: HTMLElement) {
			hasEventBeforeFocus = true;
			focus.apply(this, arguments as unknown as [options?: FocusOptions | undefined]);
		},
	});

	documentObject.addEventListener('keydown', handleKeyboardEvent, true);
	documentObject.addEventListener('keyup', handleKeyboardEvent, true);
	documentObject.addEventListener('click', handleClickEvent, true);

	// Register focus events on the window so they are sure to happen
	// before the framework's event listeners (registered on the document).
	windowObject.addEventListener('focus', handleFocusEvent, true);
	windowObject.addEventListener('blur', handleWindowBlur, false);

	if (typeof PointerEvent !== 'undefined') {
		documentObject.addEventListener('pointerdown', handlePointerEvent, true);
		documentObject.addEventListener('pointermove', handlePointerEvent, true);
		documentObject.addEventListener('pointerup', handlePointerEvent, true);
	} else if (process.env.NODE_ENV === 'test') {
		documentObject.addEventListener('mousedown', handlePointerEvent, true);
		documentObject.addEventListener('mousemove', handlePointerEvent, true);
		documentObject.addEventListener('mouseup', handlePointerEvent, true);
	}

	// Add unmount handler
	windowObject.addEventListener(
		'beforeunload',
		() => {
			tearDownWindowFocusTracking(element);
		},
		{ once: true },
	);

	hasSetupGlobalListeners.set(windowObject, { focus });
}

const tearDownWindowFocusTracking = (element?: HTMLElement | null, loadListener?: () => void) => {
	const windowObject = getOwnerWindow(element);
	const documentObject = getOwnerDocument(element);
	if (loadListener) {
		documentObject.removeEventListener('DOMContentLoaded', loadListener);
	}
	if (!hasSetupGlobalListeners.has(windowObject)) {
		return;
	}
	Reflect.defineProperty(windowObject.HTMLElement.prototype, 'focus', {
		configurable: true,
		writable: true,
		value: hasSetupGlobalListeners.get(windowObject)!.focus,
	});

	documentObject.removeEventListener('keydown', handleKeyboardEvent, true);
	documentObject.removeEventListener('keyup', handleKeyboardEvent, true);
	documentObject.removeEventListener('click', handleClickEvent, true);

	windowObject.removeEventListener('focus', handleFocusEvent, true);
	windowObject.removeEventListener('blur', handleWindowBlur, false);

	if (typeof PointerEvent !== 'undefined') {
		documentObject.removeEventListener('pointerdown', handlePointerEvent, true);
		documentObject.removeEventListener('pointermove', handlePointerEvent, true);
		documentObject.removeEventListener('pointerup', handlePointerEvent, true);
	} else if (process.env.NODE_ENV === 'test') {
		documentObject.removeEventListener('mousedown', handlePointerEvent, true);
		documentObject.removeEventListener('mousemove', handlePointerEvent, true);
		documentObject.removeEventListener('mouseup', handlePointerEvent, true);
	}

	hasSetupGlobalListeners.delete(windowObject);
};

/**
 * EXPERIMENTAL
 * Adds a window (i.e. iframe) to the list of windows that are being tracked for focus visible.
 *
 * Sometimes apps render portions of their tree into an iframe. In this case, we cannot accurately
 * track if the focus is visible because we cannot see interactions inside the iframe. If you have
 * this in your application's architecture, then this function will attach event listeners inside
 * the iframe. You should call `addWindowFocusTracking` with an element from inside the window you
 * wish to add. We'll retrieve the relevant elements based on that. Note, you do not need to call
 * this for the default window, as we call it for you.
 *
 * When you are ready to stop listening, but you do not wish to unmount the iframe, you may call the
 * cleanup function returned by `addWindowFocusTracking`. Otherwise, when you unmount the iframe,
 * all listeners and state will be cleaned up automatically for you.
 *
 * @param element @default document.body - The element provided will be used to get the window to
 *   add.
 * @returns A function to remove the event listeners and cleanup the state.
 */
export function addWindowFocusTracking(element?: HTMLElement | null): () => void {
	const documentObject = getOwnerDocument(element);
	let loadListener: (() => void) | undefined;
	if (documentObject.readyState !== 'loading') {
		setupGlobalFocusEvents(element);
	} else {
		loadListener = () => {
			setupGlobalFocusEvents(element);
		};
		documentObject.addEventListener('DOMContentLoaded', loadListener);
	}

	return () => tearDownWindowFocusTracking(element, loadListener);
}

// Server-side rendering does not have the document object defined
if (typeof document !== 'undefined') {
	addWindowFocusTracking();
}

/**
 * If true, keyboard focus is visible.
 */
export function isFocusVisible(): boolean {
	return currentModality !== 'pointer';
}

export function getInteractionModality(): Modality | null {
	return currentModality;
}

export function setInteractionModality(modality: Modality): void {
	currentModality = modality;
	currentPointerType = modality === 'pointer' ? 'mouse' : modality;
	triggerChangeHandlers(modality, null);
}

/** @private */
export function getPointerType(): PointerType {
	return currentPointerType;
}

/**
 * Keeps state of the current modality.
 */
export function useInteractionModality(): Modality | null;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useInteractionModality(slot: symbol | undefined): Modality | null;
export function useInteractionModality(...args: any[]): Modality | null {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useInteractionModality');

	setupGlobalFocusEvents();

	let [modality, setModality] = useState(currentModality, subSlot(slot, 'modality'));
	useEffect(
		() => {
			let handler = () => {
				setModality(currentModality);
			};

			changeHandlers.add(handler);
			return () => {
				changeHandlers.delete(handler);
			};
		},
		[],
		subSlot(slot, 'subscribe'),
	);

	return useIsSSR(subSlot(slot, 'ssr')) ? null : modality;
}

const nonTextInputTypes = new Set([
	'checkbox',
	'radio',
	'range',
	'color',
	'file',
	'image',
	'button',
	'submit',
	'reset',
]);

/**
 * If this is attached to text input component, return if the event is a focus event (Tab/Escape
 * keys pressed) so that focus visible style can be properly set.
 */
function isKeyboardFocusEvent(isTextInput: boolean, modality: Modality, e: HandlerEvent) {
	let eventTarget = e ? (getEventTarget(e) as Element) : undefined;
	let document = getOwnerDocument(eventTarget);
	let ownerWindow = getOwnerWindow(eventTarget);
	const IHTMLInputElement =
		typeof ownerWindow !== 'undefined' ? ownerWindow.HTMLInputElement : HTMLInputElement;
	const IHTMLTextAreaElement =
		typeof ownerWindow !== 'undefined' ? ownerWindow.HTMLTextAreaElement : HTMLTextAreaElement;
	const IHTMLElement = typeof ownerWindow !== 'undefined' ? ownerWindow.HTMLElement : HTMLElement;
	const IKeyboardEvent =
		typeof ownerWindow !== 'undefined' ? ownerWindow.KeyboardEvent : KeyboardEvent;

	// For keyboard events that occur on a non-input element that will move focus into input element (aka ArrowLeft going from Datepicker button to the main input group)
	// we need to rely on the user passing isTextInput into here. This way we can skip toggling focus visiblity for said input element
	let activeElement = getActiveElement(document);
	isTextInput =
		isTextInput ||
		(activeElement instanceof IHTMLInputElement && !nonTextInputTypes.has(activeElement.type)) ||
		activeElement instanceof IHTMLTextAreaElement ||
		(activeElement instanceof IHTMLElement && activeElement.isContentEditable);
	return !(
		isTextInput &&
		modality === 'keyboard' &&
		e instanceof IKeyboardEvent &&
		!FOCUS_VISIBLE_INPUT_KEYS[e.key]
	);
}

/**
 * Manages focus visible state for the page, and subscribes individual components for updates.
 */
export function useFocusVisible(props?: FocusVisibleProps): FocusVisibleResult;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFocusVisible(
	props: FocusVisibleProps | undefined,
	slot: symbol | undefined,
): FocusVisibleResult;
export function useFocusVisible(...args: any[]): FocusVisibleResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocusVisible');
	const props = (user[0] as FocusVisibleProps) ?? {};

	let { isTextInput, autoFocus } = props;
	let [isFocusVisibleState, setFocusVisible] = useState(
		autoFocus || isFocusVisible(),
		subSlot(slot, 'state'),
	);
	useFocusVisibleListener(
		(isFocusVisible) => {
			setFocusVisible(isFocusVisible);
		},
		[isTextInput],
		{ isTextInput },
		subSlot(slot, 'listener'),
	);

	return { isFocusVisible: isFocusVisibleState };
}

/**
 * Listens for trigger change and reports if focus is visible (i.e., modality is not pointer).
 */
export function useFocusVisibleListener(
	fn: FocusVisibleHandler,
	deps: ReadonlyArray<any>,
	opts?: { enabled?: boolean; isTextInput?: boolean },
): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFocusVisibleListener(
	fn: FocusVisibleHandler,
	deps: ReadonlyArray<any>,
	opts: { enabled?: boolean; isTextInput?: boolean } | undefined,
	slot: symbol | undefined,
): void;
export function useFocusVisibleListener(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocusVisibleListener');
	const fn = user[0] as FocusVisibleHandler;
	const deps = user[1] as any[];
	const opts = user[2] as { enabled?: boolean; isTextInput?: boolean } | undefined;

	setupGlobalFocusEvents();

	useEffect(
		() => {
			if (opts?.enabled === false) {
				return;
			}
			let handler = (modality: Modality, e: HandlerEvent) => {
				// We want to early return for any keyboard events that occur inside text inputs EXCEPT for Tab and Escape
				if (!isKeyboardFocusEvent(!!opts?.isTextInput, modality, e)) {
					return;
				}
				fn(isFocusVisible());
			};
			changeHandlers.add(handler);
			return () => {
				changeHandlers.delete(handler);
			};
		},
		deps,
		subSlot(slot, 'listen'),
	);
}
