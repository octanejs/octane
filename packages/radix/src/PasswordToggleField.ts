// Ported from @radix-ui/react-password-toggle-field (source:
// .radix-primitives/packages/react/password-toggle-field/src/password-toggle-field.tsx).
// A password input with a visibility toggle. `Root` owns the visibility state (via
// useControllableState), the shared input id, and cross-part focus bookkeeping. `Input`
// renders the native input, switching `type` between "password"/"text", and resets
// visibility to hidden on the owning form's `reset`/`submit` (so the browser never
// remembers a revealed value). `Toggle` is a plain `type=button` that flips visibility;
// it derives a default aria-label ("Show password"/"Hide password") only when it has no
// text content (MutationObserver-tracked), is aria-hidden/untabbable until hydrated, and
// keeps focus (and the selection recorded at input blur) inside the input when the
// toggle interaction started from a pointer (the `clickTriggered` focusState ref, reset
// via window `pointerup` + requestIdleCallback). `Slot` renders per-state children
// (visible/hidden props or a render callback); `Icon` projects the per-state icon
// element through `Primitive.svg asChild`.
//
// octane adaptations (all previously established in this binding):
// - Plain `.ts` + createElement; no forwardRef (`ref: forwardedRef` prop); explicit hook
//   slots via S/subSlot (files skip the compiler's auto-slotting pass).
// - Events are NATIVE delegated DOM events (onClick/onPointerDown/onPointerCancel/
//   onPointerUp/onBlur); the runtime patches `event.currentTarget` to the handler's
//   element during delegated dispatch, so the Input's blur selection-capture works
//   unchanged. `event.defaultPrevented` is the real DOM flag.
// - React's `flushSync` from 'react-dom' → octane's `flushSync`.
// - `spellCheck={false}` must render the literal `spellcheck="false"` attribute (octane's
//   setAttribute removes `false`-valued non-aria attributes), so booleans are stringified.
// - octane's useControllableState takes `{ prop, defaultProp, onChange }` (no `caller` —
//   that only feeds React dev warnings).
// - Dev-only console.warn surfaces are skipped (repo policy: functional outcomes only) —
//   the misspelled `onVisiblityChange` prop FALLBACK is functional and is kept; its
//   deprecation warning effect is not.
// Faithfully-kept source quirks (do not "fix"): the Toggle button sets `id={inputId}`
// before its prop spread (upstream renders the duplicate id), it destructures the
// user's `onFocus` without ever attaching it (upstream swallows it), and it computes a
// pre-hydration `tabIndex ??= -1` that is never rendered onto the button (upstream
// swallows `tabIndex` too).
import { createElement, flushSync, useCallback, useEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { useEffectEvent } from './use-effect-event';
import { useId } from './useId';
import { useIsHydrated } from './use-is-hydrated';
import { useControllableState } from './useControllableState';

const PASSWORD_TOGGLE_FIELD_NAME = 'PasswordToggleField';

/* -------------------------------------------------------------------------------------------------
 * PasswordToggleFieldProvider
 * -----------------------------------------------------------------------------------------------*/

interface InternalFocusState {
	clickTriggered: boolean;
	selectionStart: number | null;
	selectionEnd: number | null;
}

interface PasswordToggleFieldContextValue {
	inputId: string;
	inputRef: { current: HTMLInputElement | null };
	visible: boolean;
	setVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
	syncInputId: (providedId: string | number | undefined) => void;
	focusState: { current: InternalFocusState };
}

const [createPasswordToggleFieldContext, createPasswordToggleFieldScope] = createContextScope(
	PASSWORD_TOGGLE_FIELD_NAME,
);
export { createPasswordToggleFieldScope };

const [PasswordToggleFieldProvider, usePasswordToggleFieldContext] =
	createPasswordToggleFieldContext<PasswordToggleFieldContextValue>(PASSWORD_TOGGLE_FIELD_NAME);

/* -------------------------------------------------------------------------------------------------
 * PasswordToggleField
 * -----------------------------------------------------------------------------------------------*/

const INITIAL_FOCUS_STATE: InternalFocusState = {
	clickTriggered: false,
	selectionStart: null,
	selectionEnd: null,
};

export function PasswordToggleField(props: any): any {
	const slot = S('PasswordToggleField.Root');
	const {
		__scopePasswordToggleField,
		visible: visibleProp,
		defaultVisible,
		children,
	} = props ?? {};

	const baseId = useId(props?.id, subSlot(slot, 'id'));
	const defaultInputId = `${baseId}-input`;
	const [inputIdState, setInputIdState] = useState<null | string>(
		defaultInputId,
		subSlot(slot, 'inputId'),
	);
	const inputId = inputIdState ?? defaultInputId;
	const syncInputId = useCallback(
		(providedId: string | number | undefined) =>
			setInputIdState(providedId != null ? String(providedId) : null),
		[],
		subSlot(slot, 'syncId'),
	);

	// Functional half of the source's misspelled-prop handling: honor a legacy
	// `onVisiblityChange` when the correctly-spelled prop is absent. (The dev-only
	// deprecation console.warn effect is intentionally not ported.)
	let onVisibilityChange = props?.onVisibilityChange;
	if (
		!onVisibilityChange &&
		props != null &&
		'onVisiblityChange' in props &&
		typeof props.onVisiblityChange === 'function'
	) {
		onVisibilityChange = props.onVisiblityChange;
	}

	const [visible = false, setVisible] = useControllableState<boolean>(
		{
			prop: visibleProp,
			defaultProp: defaultVisible ?? false,
			onChange: onVisibilityChange,
		},
		subSlot(slot, 'visible'),
	);

	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	const focusState = useRef<InternalFocusState>(INITIAL_FOCUS_STATE, subSlot(slot, 'focusState'));

	return createElement(PasswordToggleFieldProvider, {
		scope: __scopePasswordToggleField,
		inputId,
		inputRef,
		setVisible,
		syncInputId,
		visible,
		focusState,
		children,
	});
}

/* -------------------------------------------------------------------------------------------------
 * PasswordToggleFieldInput
 * -----------------------------------------------------------------------------------------------*/

const PASSWORD_TOGGLE_FIELD_INPUT_NAME = PASSWORD_TOGGLE_FIELD_NAME + 'Input';

export function PasswordToggleFieldInput(props: any): any {
	const slot = S('PasswordToggleField.Input');
	const {
		__scopePasswordToggleField,
		autoComplete = 'current-password',
		autoCapitalize = 'off',
		spellCheck = false,
		id: idProp,
		ref: forwardedRef,
		onBlur,
		...inputProps
	} = props ?? {};
	const { visible, inputRef, inputId, syncInputId, setVisible, focusState } =
		usePasswordToggleFieldContext(PASSWORD_TOGGLE_FIELD_INPUT_NAME, __scopePasswordToggleField);

	useEffect(
		() => {
			syncInputId(idProp);
		},
		[idProp, syncInputId],
		subSlot(slot, 'e:syncId'),
	);

	// We want to reset the visibility to `false` to revert the input to
	// `type="password"` when:
	// - The form is reset (for consistency with other form controls)
	// - The form is submitted (to prevent the browser from remembering the
	//   input's value.
	//
	// See "Keeping things secure":
	//   https://technology.blog.gov.uk/2021/04/19/simple-things-are-complicated-making-a-show-password-option/)
	const _setVisible = useEffectEvent(setVisible, subSlot(slot, 'setVisible'));
	useEffect(
		() => {
			const inputElement = inputRef.current;
			const form = inputElement?.form;
			if (!form) {
				return;
			}

			const controller = new AbortController();
			form.addEventListener(
				'reset',
				(event: Event) => {
					if (!event.defaultPrevented) {
						_setVisible(false);
					}
				},
				{ signal: controller.signal },
			);
			form.addEventListener(
				'submit',
				() => {
					// always reset the visibility on submit regardless of whether the
					// default action is prevented
					_setVisible(false);
				},
				{ signal: controller.signal },
			);
			return () => {
				controller.abort();
			};
		},
		[inputRef],
		subSlot(slot, 'e:form'),
	);

	const composedRefs = useComposedRefs(forwardedRef, inputRef, subSlot(slot, 'refs'));

	return createElement(Primitive.input, {
		...inputProps,
		id: idProp ?? inputId,
		autoCapitalize,
		autoComplete,
		ref: composedRefs,
		// octane: boolean spellCheck must render the literal "true"/"false" attribute value
		// (octane's setAttribute removes `false`-valued attributes; React stringifies it).
		spellCheck: typeof spellCheck === 'boolean' ? String(spellCheck) : spellCheck,
		type: visible ? 'text' : 'password',
		onBlur: composeEventHandlers(onBlur, (event: FocusEvent) => {
			// get the cursor position
			const { selectionStart, selectionEnd } = event.currentTarget as HTMLInputElement;
			focusState.current.selectionStart = selectionStart;
			focusState.current.selectionEnd = selectionEnd;
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * PasswordToggleFieldToggle
 * -----------------------------------------------------------------------------------------------*/

const PASSWORD_TOGGLE_FIELD_TOGGLE_NAME = PASSWORD_TOGGLE_FIELD_NAME + 'Toggle';

export function PasswordToggleFieldToggle(props: any): any {
	const slot = S('PasswordToggleField.Toggle');
	const {
		__scopePasswordToggleField,
		onClick,
		onPointerDown,
		onPointerCancel,
		onPointerUp,
		// Kept verbatim from the source: `onFocus` is destructured off the props and never
		// attached to the button (the upstream component swallows it).
		onFocus: _onFocus,
		children,
		'aria-label': ariaLabelProp,
		ref: forwardedRef,
		...toggleProps
	} = props ?? {};
	let { 'aria-controls': ariaControls, 'aria-hidden': ariaHidden, tabIndex } = toggleProps;
	delete toggleProps['aria-controls'];
	delete toggleProps['aria-hidden'];
	delete toggleProps.tabIndex;

	const { setVisible, visible, inputRef, inputId, focusState } = usePasswordToggleFieldContext(
		PASSWORD_TOGGLE_FIELD_TOGGLE_NAME,
		__scopePasswordToggleField,
	);
	const [internalAriaLabel, setInternalAriaLabel] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'ariaLabel'),
	);
	const elementRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'el'));
	const ref = useComposedRefs(forwardedRef, elementRef, subSlot(slot, 'refs'));
	const isHydrated = useIsHydrated(subSlot(slot, 'hydrated'));

	useEffect(
		() => {
			const element = elementRef.current;
			if (!element || ariaLabelProp) {
				setInternalAriaLabel(undefined);
				return;
			}

			const DEFAULT_ARIA_LABEL = visible ? 'Hide password' : 'Show password';

			function checkForInnerTextLabel(textContent: string | undefined | null): void {
				const text = textContent ? textContent : undefined;
				// If the element has inner text, no need to force an aria-label.
				setInternalAriaLabel(text ? undefined : DEFAULT_ARIA_LABEL);
			}

			checkForInnerTextLabel(element.textContent);

			const observer = new MutationObserver((entries) => {
				let textContent: string | undefined;
				for (const entry of entries) {
					if (entry.type === 'characterData') {
						if (element.textContent) {
							textContent = element.textContent;
						}
					}
				}
				checkForInnerTextLabel(textContent);
			});
			observer.observe(element, { characterData: true, subtree: true });
			return () => {
				observer.disconnect();
			};
		},
		[visible, ariaLabelProp],
		subSlot(slot, 'e:label'),
	);

	const ariaLabel = ariaLabelProp || internalAriaLabel;

	// Before hydration the button will not work, but we want to render it
	// regardless to prevent potential layout shift. Hide it from assistive tech
	// by default. Post-hydration it will be visible, focusable and associated
	// with the input via aria-controls.
	if (!isHydrated) {
		ariaHidden ??= true;
		// Kept verbatim from the source: `tabIndex` is destructured and defaulted here but
		// never rendered onto the button (upstream swallows it, user-provided or not).
		tabIndex ??= -1;
	} else {
		ariaControls ??= inputId;
	}
	void tabIndex;

	useEffect(
		() => {
			let cleanup = (): void => {};
			const ownerWindow = elementRef.current?.ownerDocument?.defaultView || window;
			const reset = (): boolean => (focusState.current.clickTriggered = false);
			const handlePointerUp = (): void => {
				cleanup = requestIdleCallback(ownerWindow, reset);
			};
			ownerWindow.addEventListener('pointerup', handlePointerUp);
			return () => {
				cleanup();
				ownerWindow.removeEventListener('pointerup', handlePointerUp);
			};
		},
		[focusState],
		subSlot(slot, 'e:pointerup'),
	);

	return createElement(Primitive.button, {
		'aria-controls': ariaControls,
		'aria-hidden': ariaHidden,
		'aria-label': ariaLabel,
		ref,
		id: inputId,
		...toggleProps,
		onPointerDown: composeEventHandlers(onPointerDown, () => {
			focusState.current.clickTriggered = true;
		}),
		onPointerCancel: (event: PointerEvent) => {
			// do not use `composeEventHandlers` here because we always want to
			// reset the ref on cancellation, regardless of whether the user has
			// called preventDefault on the event
			onPointerCancel?.(event);
			focusState.current = INITIAL_FOCUS_STATE;
		},
		// do not use `composeEventHandlers` here because we always want to
		// reset the ref after click, regardless of whether the user has
		// called preventDefault on the event
		onClick: (event: MouseEvent) => {
			onClick?.(event);
			if (event.defaultPrevented) {
				focusState.current = INITIAL_FOCUS_STATE;
				return;
			}

			flushSync(() => {
				setVisible((s: boolean) => !s);
			});
			if (focusState.current.clickTriggered) {
				const input = inputRef.current;
				if (input) {
					const { selectionStart, selectionEnd } = focusState.current;
					input.focus();
					if (selectionStart !== null || selectionEnd !== null) {
						// wait a tick so that focus has settled, then restore select position
						requestAnimationFrame(() => {
							// make sure the input still has focus (developer may have
							// programatically moved focus elsewhere)
							if (input.ownerDocument.activeElement === input) {
								input.selectionStart = selectionStart;
								input.selectionEnd = selectionEnd;
							}
						});
					}
				}
			}
			focusState.current = INITIAL_FOCUS_STATE;
		},
		onPointerUp: (event: PointerEvent) => {
			onPointerUp?.(event);
			// if click handler hasn't been called at this point, it may have been
			// intercepted, in which case we still want to reset our internal
			// state
			setTimeout(() => {
				focusState.current = INITIAL_FOCUS_STATE;
			}, 50);
		},
		type: 'button',
		children,
	});
}

/* -------------------------------------------------------------------------------------------------
 * PasswordToggleFieldSlot
 * -----------------------------------------------------------------------------------------------*/

const PASSWORD_TOGGLE_FIELD_SLOT_NAME = PASSWORD_TOGGLE_FIELD_NAME + 'Slot';

export function PasswordToggleFieldSlot(props: any): any {
	const { __scopePasswordToggleField, ...slotProps } = props ?? {};
	const { visible } = usePasswordToggleFieldContext(
		PASSWORD_TOGGLE_FIELD_SLOT_NAME,
		__scopePasswordToggleField,
	);

	return 'render' in slotProps
		? //
			slotProps.render({ visible })
		: visible
			? slotProps.visible
			: slotProps.hidden;
}

/* -------------------------------------------------------------------------------------------------
 * PasswordToggleFieldIcon
 * -----------------------------------------------------------------------------------------------*/

const PASSWORD_TOGGLE_FIELD_ICON_NAME = PASSWORD_TOGGLE_FIELD_NAME + 'Icon';

export function PasswordToggleFieldIcon(props: any): any {
	const {
		__scopePasswordToggleField,
		// (source drops `children` — the icon elements come through the
		// `visible`/`hidden` props)
		children: _children,
		ref: forwardedRef,
		...rest
	} = props ?? {};
	const { visible } = usePasswordToggleFieldContext(
		PASSWORD_TOGGLE_FIELD_ICON_NAME,
		__scopePasswordToggleField,
	);
	const { visible: visibleIcon, hidden: hiddenIcon, ...domProps } = rest;
	return createElement(Primitive.svg, {
		...domProps,
		ref: forwardedRef,
		'aria-hidden': true,
		asChild: true,
		children: visible ? visibleIcon : hiddenIcon,
	});
}

/* -----------------------------------------------------------------------------------------------*/

export {
	PasswordToggleField as Root,
	PasswordToggleFieldInput as Input,
	PasswordToggleFieldToggle as Toggle,
	PasswordToggleFieldSlot as Slot,
	PasswordToggleFieldIcon as Icon,
};

function requestIdleCallback(
	window: Window & typeof globalThis,
	callback: IdleRequestCallback,
	options?: IdleRequestOptions,
): () => void {
	if ((window as any).requestIdleCallback) {
		const id = window.requestIdleCallback(callback, options);
		return () => {
			window.cancelIdleCallback(id);
		};
	}
	const start = Date.now();
	const id = window.setTimeout(() => {
		const timeRemaining = (): number => Math.max(0, 50 - (Date.now() - start));
		callback({ didTimeout: false, timeRemaining });
	}, 1);
	return () => {
		window.clearTimeout(id);
	};
}
