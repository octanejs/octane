// Ported from .base-ui/packages/react/src/slider/ (v1.6.0): root/SliderRoot (+ SliderRootContext,
// stateAttributesMapping), control/SliderControl, track/SliderTrack, indicator/SliderIndicator,
// thumb/SliderThumb, value/SliderValue, label/SliderLabel — plus its `index.parts` (the `Slider`
// namespace).
//
// octane adaptations: `React.forwardRef` → ref-as-prop; native delegated events (no
// `.nativeEvent` — the handler's `event` IS the native event); `useMergedRefs` → `useComposedRefs`;
// `useIsoLayoutEffect` → `useLayoutEffect`. Unlike a controlled TEXT input, a controlled range
// input reflects its live value to the `value` ATTRIBUTE (verified vs React), so octane's native
// attribute write matches with no freeze/property adaptation. SSR-only bits are dropped: the
// `thumbAlignment: 'edge'` pre-hydration `<script>` + CSP nonce, and `suppressHydrationWarning` (a
// React hydration-warning no-op). With the default `center` alignment, thumb/indicator positions
// are pure math (`valueToPercent`), so mount and keyboard interaction render identically without
// layout (pointer drag needs real layout — inert in jsdom, so not differential-covered).
import {
	createContext,
	createElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { mergeProps } from './utils/mergeProps';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useComposedRefs } from './utils/composeRefs';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { useValueAsRef } from './utils/useValueAsRef';
import { useValueChanged } from './utils/useValueChanged';
import { useBaseUiId } from './utils/useBaseUiId';
import { useAnimationFrame } from './utils/useAnimationFrame';
import { clamp } from './utils/clamp';
import { areArraysEqual } from './utils/areArraysEqual';
import { contains } from './utils/contains';
import { addEventListener } from './utils/addEventListener';
import { ownerDocument, ownerWindow } from './utils/owner';
import { visuallyHidden } from './utils/visuallyHidden';
import { valueToPercent } from './utils/valueToPercent';
import { formatNumber } from './utils/formatNumber';
import { matchesFocusVisible } from './utils/matchesFocusVisible';
import { useIsHydrating } from './utils/useIsHydrating';
import { getTarget } from './utils/composite/list-utils';
import { CompositeList } from './utils/composite/CompositeList';
import { useCompositeListItem } from './utils/composite/useCompositeListItem';
import {
	ARROW_UP,
	ARROW_DOWN,
	ARROW_LEFT,
	ARROW_RIGHT,
	HOME,
	END,
	PAGE_UP,
	PAGE_DOWN,
	COMPOSITE_KEYS,
} from './utils/composite/keys';
import { useDirection } from './utils/DirectionContext';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useLabelableId } from './utils/field/useLabelableId';
import { useLabel, focusElementWithVisible } from './utils/field/useLabel';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import {
	createChangeEventDetails,
	createGenericEventDetails,
	REASONS,
} from './utils/createChangeEventDetails';
import { asc } from './utils/slider/asc';
import { getSliderValue } from './utils/slider/getSliderValue';
import { getMidpoint } from './utils/slider/getMidpoint';
import { getDecimalPrecision, roundValueToStep } from './utils/slider/roundValueToStep';
import { validateMinimumDistance } from './utils/slider/validateMinimumDistance';
import { resolveThumbCollision } from './utils/slider/resolveThumbCollision';
import { resolveAriaLabelledBy, getDefaultLabelId } from './utils/resolveAriaLabelledBy';

type Orientation = 'horizontal' | 'vertical';

const ALL_KEYS = new Set([...COMPOSITE_KEYS, PAGE_UP, PAGE_DOWN]);
const INTENTIONAL_DRAG_COUNT_THRESHOLD = 2;

function isElementNode(target: unknown): target is Element {
	return target != null && target instanceof Element;
}

function isHTMLElementNode(target: unknown): target is HTMLElement {
	return target != null && target instanceof HTMLElement;
}

// --- state → data-* mapping --------------------------------------------------

const sliderStateAttributesMapping: StateAttributesMapping<any> = {
	activeThumbIndex: () => null,
	max: () => null,
	min: () => null,
	minStepsBetweenValues: () => null,
	step: () => null,
	values: () => null,
	...(fieldValidityMapping as StateAttributesMapping<any>),
};

export interface SliderRootState extends FieldRootState {
	activeThumbIndex: number;
	disabled: boolean;
	dragging: boolean;
	max: number;
	min: number;
	minStepsBetweenValues: number;
	orientation: Orientation;
	step: number;
	values: readonly number[];
}

// --- Context -----------------------------------------------------------------

const SliderRootContext = createContext<any>(undefined);

function useSliderRootContext(): any {
	const context = useContext(SliderRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: SliderRootContext is missing. Slider parts must be placed within <Slider.Root>.',
		);
	}
	return context;
}

function getSliderChangeEventReason(event: any): string {
	return 'key' in event ? REASONS.keyboard : REASONS.inputChange;
}

function areValuesEqual(
	newValue: number | readonly number[],
	oldValue: number | readonly number[],
) {
	if (typeof newValue === 'number' && typeof oldValue === 'number') {
		return newValue === oldValue;
	}
	if (Array.isArray(newValue) && Array.isArray(oldValue)) {
		return areArraysEqual(newValue, oldValue);
	}
	return false;
}

// --- Root --------------------------------------------------------------------

function SliderRoot(componentProps: any): any {
	const slot = S('SliderRoot');
	const {
		'aria-labelledby': ariaLabelledByProp,
		className,
		defaultValue,
		disabled: disabledProp = false,
		id: idProp,
		format,
		largeStep = 10,
		locale,
		render,
		max = 100,
		min = 0,
		minStepsBetweenValues = 0,
		form,
		name: nameProp,
		onValueChange: onValueChangeProp,
		onValueCommitted: onValueCommittedProp,
		orientation = 'horizontal',
		step = 1,
		thumbCollisionBehavior = 'push',
		thumbAlignment = 'center',
		value: valueProp,
		style,
		ref,
		...elementProps
	} = componentProps;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));
	const defaultLabelId = getDefaultLabelId(id);
	const onValueChange = useStableCallback(onValueChangeProp, subSlot(slot, 'onChange'));
	const onValueCommitted = useStableCallback(onValueCommittedProp, subSlot(slot, 'onCommit'));

	const { clearErrors } = useFormContext();
	const {
		state: fieldState,
		disabled: fieldDisabled,
		name: fieldName,
		setTouched,
		setDirty,
		validityData,
		validation,
	} = useFieldRootContext();
	const { labelId: fieldLabelId } = useLabelableContext();
	const [labelId, setLabelId] = useState<string | undefined>(undefined, subSlot(slot, 'labelId'));

	const ariaLabelledby = ariaLabelledByProp ?? resolveAriaLabelledBy(fieldLabelId, labelId);
	const disabled = fieldDisabled || disabledProp;
	const name = fieldName ?? nameProp;

	const [valueUnwrapped, setValueUnwrapped] = useControlled<number | readonly number[]>(
		{ controlled: valueProp, default: defaultValue ?? min, name: 'Slider' },
		subSlot(slot, 'value'),
	);

	const sliderRef = useRef<HTMLElement | null>(null, subSlot(slot, 'sliderRef'));
	const controlRef = useRef<HTMLElement | null>(null, subSlot(slot, 'controlRef'));
	const thumbRefs = useRef<(HTMLElement | null)[]>([], subSlot(slot, 'thumbRefs'));
	const pressedInputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'pressedInput'));
	const pressedThumbCenterOffsetRef = useRef<number | null>(null, subSlot(slot, 'pressedOffset'));
	const pressedThumbIndexRef = useRef(-1, subSlot(slot, 'pressedIndex'));
	const pressedValuesRef = useRef<readonly number[] | null>(null, subSlot(slot, 'pressedValues'));
	const lastChangeReasonRef = useRef<string>('none', subSlot(slot, 'lastReason'));

	const formatOptionsRef = useValueAsRef<Intl.NumberFormatOptions | undefined>(
		format,
		subSlot(slot, 'fmtRef'),
	);

	const [active, setActiveState] = useState(-1, subSlot(slot, 'active'));
	const [lastUsedThumbIndex, setLastUsedThumbIndex] = useState(-1, subSlot(slot, 'lastUsed'));
	const [dragging, setDragging] = useState(false, subSlot(slot, 'dragging'));
	const [thumbMap, setThumbMap] = useState(() => new Map<Node, any>(), subSlot(slot, 'thumbMap'));
	const [indicatorPosition, setIndicatorPosition] = useState<(number | undefined)[]>(
		[undefined, undefined],
		subSlot(slot, 'indicatorPos'),
	);

	const setActive = useStableCallback(
		(value: number) => {
			setActiveState(value);
			if (value !== -1) {
				setLastUsedThumbIndex(value);
			}
		},
		subSlot(slot, 'setActive'),
	);

	useRegisterFieldControl(
		validation.inputRef,
		id,
		valueUnwrapped,
		undefined,
		!disabled,
		nameProp,
		subSlot(slot, 'register'),
	);

	useValueChanged(
		valueUnwrapped,
		() => {
			clearErrors(name);
			validation.change(valueUnwrapped);
			const initialValue = validityData.initialValue;
			let isDirty: boolean;
			if (Array.isArray(valueUnwrapped) && Array.isArray(initialValue)) {
				isDirty = !areArraysEqual(valueUnwrapped, initialValue);
			} else {
				isDirty = valueUnwrapped !== initialValue;
			}
			setDirty(isDirty);
		},
		subSlot(slot, 'valueChanged'),
	);

	const registerFieldControlRef = useStableCallback(
		(element: HTMLElement | null) => {
			if (element) {
				controlRef.current = element;
			}
		},
		subSlot(slot, 'regRef'),
	);

	const range = Array.isArray(valueUnwrapped);

	const values = useMemo(
		() => {
			if (!range) {
				return [clamp(valueUnwrapped as number, min, max)];
			}
			return (valueUnwrapped as number[]).slice().sort(asc);
		},
		[max, min, range, valueUnwrapped],
		subSlot(slot, 'values'),
	);

	const setValue = useStableCallback(
		(newValue: number | number[], details?: any): boolean => {
			if (Number.isNaN(newValue) || areValuesEqual(newValue, valueUnwrapped)) {
				return false;
			}

			const changeDetails =
				details ??
				createChangeEventDetails(REASONS.none, undefined, undefined, { activeThumbIndex: -1 });

			// Redefine `target` so form libraries can read `event.target.value`.
			const nativeEvent = changeDetails.event;
			const EventConstructor = (nativeEvent.constructor as typeof Event | undefined) ?? Event;
			let clonedEvent: Event;
			try {
				clonedEvent = new EventConstructor(nativeEvent.type, nativeEvent as any);
			} catch {
				clonedEvent = new Event(nativeEvent.type);
			}
			Object.defineProperty(clonedEvent, 'target', {
				writable: true,
				value: { value: newValue, name },
			});
			changeDetails.event = clonedEvent;

			onValueChange(newValue, changeDetails);

			if (changeDetails.isCanceled) {
				return false;
			}

			lastChangeReasonRef.current = changeDetails.reason;
			setValueUnwrapped(newValue);
			return true;
		},
		subSlot(slot, 'setValue'),
	);

	const handleInputChange = useStableCallback(
		(valueInput: number, index: number, event: any) => {
			const newValue = getSliderValue(valueInput, index, min, max, range, values);
			if (validateMinimumDistance(newValue, step, minStepsBetweenValues)) {
				const reason = getSliderChangeEventReason(event);
				const applied = setValue(
					newValue,
					createChangeEventDetails(reason, event, undefined, { activeThumbIndex: index }),
				);
				setTouched(true);
				if (applied) {
					onValueCommitted(newValue, createGenericEventDetails(reason, event));
				}
			}
		},
		subSlot(slot, 'handleInput'),
	);

	useLayoutEffect(
		() => {
			const activeEl = ownerDocument(sliderRef.current).activeElement;
			if (disabled && contains(sliderRef.current, activeEl)) {
				(activeEl as HTMLElement).blur();
			}
		},
		[disabled],
		subSlot(slot, 'e:disabledBlur'),
	);

	if (disabled && active !== -1) {
		setActive(-1);
	}

	const state: SliderRootState = useMemo(
		() => ({
			...fieldState,
			activeThumbIndex: active,
			disabled,
			dragging,
			orientation,
			max,
			min,
			minStepsBetweenValues,
			step,
			values,
		}),
		[
			fieldState,
			active,
			disabled,
			dragging,
			max,
			min,
			minStepsBetweenValues,
			orientation,
			step,
			values,
		],
		subSlot(slot, 'state'),
	);

	const contextValue = useMemo(
		() => ({
			active,
			controlRef,
			disabled,
			dragging,
			validation,
			formatOptionsRef,
			handleInputChange,
			indicatorPosition,
			inset: thumbAlignment !== 'center',
			labelId: ariaLabelledby,
			rootLabelId: defaultLabelId,
			largeStep,
			lastUsedThumbIndex,
			lastChangeReasonRef,
			form,
			locale,
			max,
			min,
			minStepsBetweenValues,
			name,
			onValueCommitted,
			orientation,
			pressedInputRef,
			pressedThumbCenterOffsetRef,
			pressedThumbIndexRef,
			pressedValuesRef,
			registerFieldControlRef,
			renderBeforeHydration: thumbAlignment === 'edge',
			setActive,
			setDragging,
			setIndicatorPosition,
			setLabelId,
			setValue,
			state,
			step,
			thumbCollisionBehavior,
			thumbMap,
			thumbRefs,
			values,
		}),
		[
			active,
			ariaLabelledby,
			defaultLabelId,
			disabled,
			dragging,
			validation,
			formatOptionsRef,
			handleInputChange,
			indicatorPosition,
			largeStep,
			lastUsedThumbIndex,
			form,
			locale,
			max,
			min,
			minStepsBetweenValues,
			name,
			onValueCommitted,
			orientation,
			registerFieldControlRef,
			setActive,
			setValue,
			state,
			step,
			thumbCollisionBehavior,
			thumbAlignment,
			thumbMap,
			values,
		],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, sliderRef],
			props: [
				{ 'aria-labelledby': ariaLabelledby, id, role: 'group' },
				elementProps,
				(props: any) => validation.getValidationProps(disabled, props),
			],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(SliderRootContext.Provider, {
		value: contextValue,
		children: createElement(CompositeList, {
			elementsRef: thumbRefs,
			onMapChange: setThumbMap,
			children: element,
		}),
	});
}

// --- Control -----------------------------------------------------------------

interface Coords {
	x: number;
	y: number;
}

interface FingerState {
	value: number | number[];
	thumbIndex: number;
	didSwap: boolean;
}

function getControlOffset(styles: CSSStyleDeclaration | null, vertical: boolean) {
	if (!styles) {
		return { start: 0, end: 0 };
	}
	function parseSize(value: string | null | undefined) {
		const parsed = value != null ? parseFloat(value) : 0;
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	const start = !vertical ? 'InlineStart' : 'Top';
	const end = !vertical ? 'InlineEnd' : 'Bottom';
	return {
		start:
			parseSize((styles as any)[`border${start}Width`]) +
			parseSize((styles as any)[`padding${start}`]),
		end:
			parseSize((styles as any)[`border${end}Width`]) + parseSize((styles as any)[`padding${end}`]),
	};
}

function getFingerCoords(event: any, touchIdRef: { current: number | null }): Coords | null {
	if (touchIdRef.current != null && event.changedTouches) {
		for (let i = 0; i < event.changedTouches.length; i += 1) {
			const touch = event.changedTouches[i];
			if (touch.identifier === touchIdRef.current) {
				return { x: touch.clientX, y: touch.clientY };
			}
		}
		return null;
	}
	return { x: event.clientX, y: event.clientY };
}

function SliderControl(componentProps: any): any {
	const slot = S('SliderControl');
	const { render, className, style, ref, ...elementProps } = componentProps;

	const {
		disabled,
		dragging,
		inset,
		lastChangeReasonRef,
		max,
		min,
		minStepsBetweenValues,
		onValueCommitted,
		orientation,
		pressedInputRef,
		pressedThumbCenterOffsetRef,
		pressedThumbIndexRef,
		pressedValuesRef,
		registerFieldControlRef,
		renderBeforeHydration,
		setActive,
		setDragging,
		setValue,
		state,
		step,
		thumbCollisionBehavior,
		thumbRefs,
		values,
	} = useSliderRootContext();

	const direction = useDirection();
	const range = values.length > 1;
	const vertical = orientation === 'vertical';

	const controlRef = useRef<HTMLElement | null>(null, subSlot(slot, 'controlRef'));
	const stylesRef = useRef<CSSStyleDeclaration | null>(null, subSlot(slot, 'stylesRef'));
	const setStylesRef = useStableCallback(
		(element: HTMLElement | null) => {
			if (element && stylesRef.current == null) {
				stylesRef.current = ownerWindow(element).getComputedStyle(element);
			}
		},
		subSlot(slot, 'setStyles'),
	);

	const touchIdRef = useRef<number | null>(null, subSlot(slot, 'touchId'));
	const moveCountRef = useRef(0, subSlot(slot, 'moveCount'));
	const insetThumbOffsetRef = useRef(0, subSlot(slot, 'insetOffset'));
	const currentInteractionValueRef = useRef<number | number[] | null>(
		null,
		subSlot(slot, 'currentVal'),
	);
	const latestValuesRef = useValueAsRef<readonly number[]>(values, subSlot(slot, 'latestValues'));

	function updatePressedThumb(nextIndex: number) {
		if (pressedThumbIndexRef.current !== nextIndex) {
			pressedThumbIndexRef.current = nextIndex;
		}
		const thumbElement = thumbRefs.current[nextIndex];
		if (!thumbElement) {
			pressedThumbCenterOffsetRef.current = null;
			pressedInputRef.current = null;
			return;
		}
		pressedInputRef.current = thumbElement.querySelector('input[type="range"]');
	}

	function resetPressedThumb() {
		pressedThumbIndexRef.current = -1;
		pressedThumbCenterOffsetRef.current = null;
		pressedInputRef.current = null;
	}

	function isTargetDisabledThumb(target: EventTarget | null) {
		if (!isElementNode(target)) {
			return false;
		}
		return thumbRefs.current.some((thumbEl: HTMLElement | null) => {
			if (!isElementNode(thumbEl) || !contains(thumbEl, target)) {
				return false;
			}
			return thumbEl.querySelector<HTMLInputElement>('input[type="range"]')?.disabled === true;
		});
	}

	function getFingerState(fingerCoords: Coords): FingerState | null {
		const control = controlRef.current;
		const thumbIndex = pressedThumbIndexRef.current;
		if (!control || (!range && (thumbIndex < 0 || thumbIndex >= values.length))) {
			return null;
		}
		const { width, height, bottom, left, right } = control.getBoundingClientRect();
		const controlOffset = getControlOffset(stylesRef.current, vertical);
		const insetThumbOffset = insetThumbOffsetRef.current;
		const controlSize =
			(vertical ? height : width) - controlOffset.start - controlOffset.end - insetThumbOffset * 2;
		const thumbCenterOffset = pressedThumbCenterOffsetRef.current ?? 0;
		const fingerX = fingerCoords.x - thumbCenterOffset;
		const fingerY = fingerCoords.y - thumbCenterOffset;
		const valueSize = vertical
			? bottom - fingerY - controlOffset.end
			: (direction === 'rtl' ? right - fingerX : fingerX - left) - controlOffset.start;
		const valueRescaled = clamp((valueSize - insetThumbOffset) / controlSize, 0, 1);
		let newValue = (max - min) * valueRescaled + min;
		newValue = roundValueToStep(newValue, step, min);
		newValue = clamp(newValue, min, max);

		if (!range) {
			return { value: newValue, thumbIndex, didSwap: false };
		}
		if (thumbIndex < 0) {
			return null;
		}
		return resolveThumbCollision({
			behavior: thumbCollisionBehavior,
			values,
			currentValues: latestValuesRef.current ?? values,
			initialValues: pressedValuesRef.current,
			pressedIndex: thumbIndex,
			nextValue: newValue,
			min,
			max,
			step,
			minStepsBetweenValues,
		});
	}

	function startPressing(fingerCoords: Coords) {
		pressedValuesRef.current = range ? values.slice() : null;
		currentInteractionValueRef.current = null;
		latestValuesRef.current = values;

		const pressedThumbIndex = pressedThumbIndexRef.current;
		let closestThumbIndex = pressedThumbIndex;

		if (pressedThumbIndex > -1 && pressedThumbIndex < values.length) {
			if (values[pressedThumbIndex] === max) {
				let candidateIndex = pressedThumbIndex;
				while (candidateIndex > 0 && values[candidateIndex - 1] === max) {
					candidateIndex -= 1;
				}
				closestThumbIndex = candidateIndex;
			}
		} else {
			const axis = !vertical ? 'x' : 'y';
			let minDistance: number | undefined;
			closestThumbIndex = -1;
			for (let i = 0; i < thumbRefs.current.length; i += 1) {
				const thumbEl = thumbRefs.current[i];
				if (
					isElementNode(thumbEl) &&
					!thumbEl.querySelector<HTMLInputElement>('input[type="range"]')?.disabled
				) {
					const midpoint = getMidpoint(thumbEl);
					const distance = Math.abs(fingerCoords[axis] - midpoint[axis]);
					if (minDistance === undefined || distance <= minDistance) {
						closestThumbIndex = i;
						minDistance = distance;
					}
				}
			}
		}

		if (closestThumbIndex > -1 && closestThumbIndex !== pressedThumbIndex) {
			updatePressedThumb(closestThumbIndex);
		}

		if (inset) {
			const thumbEl = thumbRefs.current[closestThumbIndex];
			if (isElementNode(thumbEl)) {
				const thumbRect = thumbEl.getBoundingClientRect();
				const side = !vertical ? 'width' : 'height';
				insetThumbOffsetRef.current = thumbRect[side] / 2;
			}
		}
	}

	function focusThumb(thumbIndex: number) {
		const input = thumbRefs.current?.[thumbIndex]?.querySelector('input[type="range"]');
		if (!input) {
			return;
		}
		(input as any).focus({ preventScroll: true, focusVisible: false });
	}

	function setValueFromPointer(finger: FingerState, reason: string, nativeEvent: any) {
		const applied = setValue(
			finger.value,
			createChangeEventDetails(reason, nativeEvent, undefined, {
				activeThumbIndex: finger.thumbIndex,
			}),
		);
		if (applied) {
			currentInteractionValueRef.current = finger.value;
			latestValuesRef.current = Array.isArray(finger.value) ? finger.value : [finger.value];
			if (finger.didSwap) {
				updatePressedThumb(finger.thumbIndex);
			}
		}
		return applied;
	}

	const handleTouchMove = useStableCallback(
		(nativeEvent: any) => {
			const fingerCoords = getFingerCoords(nativeEvent, touchIdRef);
			if (fingerCoords == null) {
				return;
			}
			moveCountRef.current += 1;
			if (nativeEvent.type === 'pointermove' && nativeEvent.buttons === 0) {
				handleTouchEnd(nativeEvent);
				return;
			}
			const finger = getFingerState(fingerCoords);
			if (finger == null) {
				return;
			}
			if (validateMinimumDistance(finger.value, step, minStepsBetweenValues)) {
				if (!dragging && moveCountRef.current > INTENTIONAL_DRAG_COUNT_THRESHOLD) {
					setDragging(true);
				}
				const applied = setValueFromPointer(finger, REASONS.drag, nativeEvent);
				if (applied && finger.didSwap) {
					focusThumb(finger.thumbIndex);
				}
			}
		},
		subSlot(slot, 'touchMove'),
	);

	const handleTouchEnd = useStableCallback(
		(nativeEvent: any) => {
			setActive(-1);
			setDragging(false);
			pressedInputRef.current = null;
			pressedThumbCenterOffsetRef.current = null;
			if (currentInteractionValueRef.current != null) {
				const commitReason = lastChangeReasonRef.current;
				onValueCommitted(
					currentInteractionValueRef.current,
					createGenericEventDetails(commitReason, nativeEvent),
				);
			}
			if (
				'pointerType' in nativeEvent &&
				controlRef.current?.hasPointerCapture(nativeEvent.pointerId)
			) {
				controlRef.current?.releasePointerCapture(nativeEvent.pointerId);
			}
			pressedThumbIndexRef.current = -1;
			touchIdRef.current = null;
			pressedValuesRef.current = null;
			currentInteractionValueRef.current = null;
			stopListening();
		},
		subSlot(slot, 'touchEnd'),
	);

	const handleTouchStart = useStableCallback(
		(nativeEvent: any) => {
			if (disabled) {
				return;
			}
			if (isTargetDisabledThumb(getTarget(nativeEvent))) {
				resetPressedThumb();
				return;
			}
			const touch = nativeEvent.changedTouches[0];
			if (touch != null) {
				touchIdRef.current = touch.identifier;
			}
			const fingerCoords = getFingerCoords(nativeEvent, touchIdRef);
			if (fingerCoords != null) {
				startPressing(fingerCoords);
				const finger = getFingerState(fingerCoords);
				if (finger == null) {
					return;
				}
				focusThumb(finger.thumbIndex);
				const applied = setValueFromPointer(finger, REASONS.trackPress, nativeEvent);
				if (applied && finger.didSwap) {
					focusThumb(finger.thumbIndex);
				}
			}
			moveCountRef.current = 0;
			const doc = ownerDocument(controlRef.current);
			doc.addEventListener('touchmove', handleTouchMove, { passive: true });
			doc.addEventListener('touchend', handleTouchEnd, { passive: true });
		},
		subSlot(slot, 'touchStart'),
	);

	const stopListening = useStableCallback(
		() => {
			const doc = ownerDocument(controlRef.current);
			doc.removeEventListener('pointermove', handleTouchMove);
			doc.removeEventListener('pointerup', handleTouchEnd);
			doc.removeEventListener('touchmove', handleTouchMove);
			doc.removeEventListener('touchend', handleTouchEnd);
			pressedValuesRef.current = null;
			currentInteractionValueRef.current = null;
		},
		subSlot(slot, 'stop'),
	);

	const focusFrame = useAnimationFrame(subSlot(slot, 'focusFrame'));

	useEffect(
		() => {
			const control = controlRef.current;
			if (!control) {
				return () => stopListening();
			}
			const unsubscribeTouchStart = addEventListener(control, 'touchstart', handleTouchStart, {
				passive: true,
			});
			return () => {
				unsubscribeTouchStart();
				focusFrame.cancel();
				stopListening();
			};
		},
		[stopListening, handleTouchStart, focusFrame],
		subSlot(slot, 'e:touchstart'),
	);

	useEffect(
		() => {
			if (disabled) {
				stopListening();
			}
		},
		[disabled, stopListening],
		subSlot(slot, 'e:disabled'),
	);

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, registerFieldControlRef, controlRef, setStylesRef],
			props: [
				{
					['data-base-ui-slider-control']: renderBeforeHydration ? '' : undefined,
					onPointerDown(event: any) {
						const control = controlRef.current;
						const target = getTarget(event);
						if (
							!control ||
							disabled ||
							event.defaultPrevented ||
							!isElementNode(target) ||
							event.button !== 0
						) {
							return;
						}
						if (isTargetDisabledThumb(target)) {
							resetPressedThumb();
							return;
						}
						const fingerCoords = getFingerCoords(event, touchIdRef);
						if (fingerCoords != null) {
							startPressing(fingerCoords);
							const finger = getFingerState(fingerCoords);
							if (finger == null) {
								return;
							}
							const pressedOnFocusedThumb = contains(
								thumbRefs.current[finger.thumbIndex],
								ownerDocument(control).activeElement,
							);
							if (pressedOnFocusedThumb) {
								event.preventDefault();
							} else {
								focusFrame.request(() => {
									focusThumb(finger.thumbIndex);
								});
							}
							setDragging(true);
							const pressedOnAnyThumb = pressedThumbCenterOffsetRef.current != null;
							if (!pressedOnAnyThumb) {
								const applied = setValueFromPointer(finger, REASONS.trackPress, event);
								if (applied && finger.didSwap) {
									focusThumb(finger.thumbIndex);
								}
							}
						}
						if (event.pointerId) {
							control.setPointerCapture(event.pointerId);
						}
						moveCountRef.current = 0;
						const doc = ownerDocument(controlRef.current);
						doc.addEventListener('pointermove', handleTouchMove, { passive: true });
						doc.addEventListener('pointerup', handleTouchEnd, { once: true });
					},
				},
				elementProps,
			],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Track -------------------------------------------------------------------

function SliderTrack(componentProps: any): any {
	const slot = S('SliderTrack');
	const { render, className, style, ref, ...elementProps } = componentProps;
	const { state } = useSliderRootContext();
	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [{ style: { position: 'relative' } }, elementProps],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Indicator ---------------------------------------------------------------

function getInsetStyles(
	vertical: boolean,
	range: boolean,
	start: number | undefined,
	end: number | undefined,
	renderBeforeHydration: boolean,
	hydrating: boolean,
): Record<string, any> {
	const visibility = start === undefined || (range && end === undefined) ? 'hidden' : undefined;
	const startEdge = vertical ? 'bottom' : 'insetInlineStart';
	const mainSide = vertical ? 'height' : 'width';
	const crossSide = vertical ? 'width' : 'height';
	const styles: Record<string, any> = {
		visibility: renderBeforeHydration && hydrating ? 'hidden' : visibility,
		position: vertical ? 'absolute' : 'relative',
		[crossSide]: 'inherit',
	};
	styles['--start-position'] = `${start ?? 0}%`;
	if (!range) {
		styles[startEdge] = 0;
		styles[mainSide] = 'var(--start-position)';
		return styles;
	}
	styles['--relative-size'] = `${(end ?? 0) - (start ?? 0)}%`;
	styles[startEdge] = 'var(--start-position)';
	styles[mainSide] = 'var(--relative-size)';
	return styles;
}

function getCenteredStyles(
	vertical: boolean,
	range: boolean,
	start: number,
	end: number,
): Record<string, any> {
	const startEdge = vertical ? 'bottom' : 'insetInlineStart';
	const mainSide = vertical ? 'height' : 'width';
	const crossSide = vertical ? 'width' : 'height';
	const styles: Record<string, any> = {
		position: vertical ? 'absolute' : 'relative',
		[crossSide]: 'inherit',
	};
	if (!range) {
		styles[startEdge] = 0;
		styles[mainSide] = `${start}%`;
		return styles;
	}
	const size = end - start;
	styles[startEdge] = `${start}%`;
	styles[mainSide] = `${size}%`;
	return styles;
}

function SliderIndicator(componentProps: any): any {
	const slot = S('SliderIndicator');
	const { render, className, style: styleProp, ref, ...elementProps } = componentProps;
	const { indicatorPosition, inset, max, min, orientation, renderBeforeHydration, state, values } =
		useSliderRootContext();
	const isHydrating = useIsHydrating();
	const vertical = orientation === 'vertical';
	const range = values.length > 1;

	const style = inset
		? getInsetStyles(
				vertical,
				range,
				indicatorPosition[0],
				indicatorPosition[1],
				renderBeforeHydration,
				isHydrating,
			)
		: getCenteredStyles(
				vertical,
				range,
				valueToPercent(values[0], min, max),
				valueToPercent(values[values.length - 1], min, max),
			);

	return useRenderElement(
		'div',
		{ render, className, style: styleProp },
		{
			state,
			ref,
			props: [
				{ ['data-base-ui-slider-indicator']: renderBeforeHydration ? '' : undefined, style },
				elementProps,
			],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Thumb -------------------------------------------------------------------

function getDefaultAriaValueText(
	values: readonly number[],
	index: number,
	format: Intl.NumberFormatOptions | undefined,
	locale: Intl.LocalesArgument | undefined,
): string | undefined {
	if (index < 0) {
		return undefined;
	}
	if (values.length === 2) {
		if (index === 0) {
			return `${formatNumber(values[index], locale, format)} start range`;
		}
		return `${formatNumber(values[index], locale, format)} end range`;
	}
	return format ? formatNumber(values[index], locale, format) : undefined;
}

function getNewValue(
	thumbValue: number,
	increment: number,
	direction: 1 | -1,
	min: number,
	max: number,
): number {
	const value = direction === 1 ? thumbValue + increment : thumbValue - increment;
	const roundedValue = Number(
		value.toFixed(
			Math.max(
				getDecimalPrecision(thumbValue),
				getDecimalPrecision(increment),
				getDecimalPrecision(min),
			),
		),
	);
	return clamp(roundedValue, min, max);
}

function SliderThumb(componentProps: any): any {
	const slot = S('SliderThumb');
	const {
		render,
		children: childrenProp,
		className,
		'aria-describedby': ariaDescribedByProp,
		'aria-label': ariaLabelProp,
		'aria-labelledby': ariaLabelledByProp,
		'aria-valuetext': ariaValueTextProp,
		disabled: disabledProp = false,
		getAriaLabel: getAriaLabelProp,
		getAriaValueText: getAriaValueTextProp,
		id: idProp,
		index: indexProp,
		inputRef: inputRefProp,
		onBlur: onBlurProp,
		onFocus: onFocusProp,
		onKeyDown: onKeyDownProp,
		tabIndex: tabIndexProp,
		style,
		ref,
		...elementProps
	} = componentProps;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const {
		active: activeIndex,
		lastUsedThumbIndex,
		controlRef,
		disabled: contextDisabled,
		validation,
		formatOptionsRef,
		handleInputChange,
		inset,
		labelId,
		largeStep,
		locale,
		max,
		min,
		minStepsBetweenValues,
		form,
		name,
		orientation,
		pressedInputRef,
		pressedThumbCenterOffsetRef,
		pressedThumbIndexRef,
		renderBeforeHydration,
		setActive,
		setIndicatorPosition,
		state,
		step,
		values: sliderValues,
	} = useSliderRootContext();

	const direction = useDirection();
	const disabled = disabledProp || contextDisabled;
	const range = sliderValues.length > 1;
	const vertical = orientation === 'vertical';
	const rtl = direction === 'rtl';

	const { setTouched, setFocused, validationMode } = useFieldRootContext();

	const thumbRef = useRef<HTMLElement | null>(null, subSlot(slot, 'thumbRef'));
	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	const restoringFocusVisibleRef = useRef(false, subSlot(slot, 'restoring'));

	const defaultInputId = useBaseUiId(undefined, subSlot(slot, 'defInputId'));
	const labelableId = useLabelableId(undefined, subSlot(slot, 'labelableId'));
	const inputId = range ? defaultInputId : labelableId;

	const thumbMetadata = useMemo(() => ({ inputId }), [inputId], subSlot(slot, 'meta'));

	const { ref: listItemRef, index: compositeIndex } = useCompositeListItem(
		{ metadata: thumbMetadata },
		subSlot(slot, 'listItem'),
	);

	const index = !range ? 0 : (indexProp ?? compositeIndex);
	const last = index === sliderValues.length - 1;
	const thumbValue = sliderValues[index];
	const thumbValuePercent = valueToPercent(thumbValue, min, max);

	const [positionPercent, setPositionPercent] = useState<number | undefined>(
		undefined,
		subSlot(slot, 'posPct'),
	);
	const isHydrating = useIsHydrating();

	const safeLastUsedThumbIndex =
		lastUsedThumbIndex >= 0 && lastUsedThumbIndex < sliderValues.length ? lastUsedThumbIndex : -1;

	const getInsetPosition = useStableCallback(
		() => {
			const control = controlRef.current;
			const thumb = thumbRef.current;
			if (!control || !thumb) {
				return;
			}
			const thumbRect = thumb.getBoundingClientRect();
			const controlRect = control.getBoundingClientRect();
			const side = vertical ? 'height' : 'width';
			const controlSize = controlRect[side] - thumbRect[side];
			const thumbOffsetFromControlEdge =
				thumbRect[side] / 2 + (controlSize * thumbValuePercent) / 100;
			const nextPositionPercent = (thumbOffsetFromControlEdge / controlRect[side]) * 100;
			const nextInsetPosition = Number.isFinite(nextPositionPercent)
				? nextPositionPercent
				: undefined;
			setPositionPercent(nextInsetPosition);
			if (index === 0) {
				setIndicatorPosition((prevPosition: any[]) => [nextInsetPosition, prevPosition[1]]);
			} else if (last) {
				setIndicatorPosition((prevPosition: any[]) => [prevPosition[0], nextInsetPosition]);
			}
		},
		subSlot(slot, 'insetPos'),
	);

	useLayoutEffect(
		() => {
			if (inset) {
				queueMicrotask(getInsetPosition);
			}
		},
		[getInsetPosition, inset],
		subSlot(slot, 'e:inset1'),
	);

	useLayoutEffect(
		() => {
			if (inset) {
				getInsetPosition();
			}
		},
		[getInsetPosition, inset, thumbValuePercent],
		subSlot(slot, 'e:inset2'),
	);

	useLayoutEffect(
		() => {
			if (!inset) {
				return undefined;
			}
			const control = controlRef.current;
			const thumb = thumbRef.current;
			if (!control || !thumb) {
				return undefined;
			}
			const ResizeObserverCtor = ownerWindow(control).ResizeObserver;
			if (typeof ResizeObserverCtor !== 'function') {
				return undefined;
			}
			const resizeObserver = new ResizeObserverCtor(getInsetPosition);
			resizeObserver.observe(control);
			resizeObserver.observe(thumb);
			return () => {
				resizeObserver.disconnect();
			};
		},
		[getInsetPosition, inset],
		subSlot(slot, 'e:inset3'),
	);

	const startEdge = vertical ? 'bottom' : 'insetInlineStart';
	const crossOffsetProperty = vertical ? 'left' : 'top';

	let zIndex: number | undefined;
	if (range) {
		if (activeIndex === index) {
			zIndex = 2;
		} else if (safeLastUsedThumbIndex === index) {
			zIndex = 1;
		}
	} else if (activeIndex === index) {
		zIndex = 1;
	}

	let thumbStyle: Record<string, any>;
	if (inset) {
		thumbStyle = {
			['--position']: `${positionPercent ?? 0}%`,
			visibility:
				(renderBeforeHydration && isHydrating) || positionPercent === undefined
					? 'hidden'
					: undefined,
			position: 'absolute',
			[startEdge]: 'var(--position)',
			[crossOffsetProperty]: '50%',
			translate: `${(vertical || !rtl ? -1 : 1) * 50}% ${(vertical ? 1 : -1) * 50}%`,
			zIndex,
		};
	} else {
		thumbStyle = !Number.isFinite(thumbValuePercent)
			? visuallyHidden
			: {
					position: 'absolute',
					[startEdge]: `${thumbValuePercent}%`,
					[crossOffsetProperty]: '50%',
					translate: `${(vertical || !rtl ? -1 : 1) * 50}% ${(vertical ? 1 : -1) * 50}%`,
					zIndex,
				};
	}

	let cssWritingMode: string | undefined;
	if (orientation === 'vertical') {
		cssWritingMode = rtl ? 'vertical-rl' : 'vertical-lr';
	}

	const ariaLabel =
		typeof getAriaLabelProp === 'function' ? getAriaLabelProp(index) : ariaLabelProp;

	const inputProps = mergeProps(
		{
			'aria-label': ariaLabel,
			'aria-labelledby': ariaLabelledByProp ?? (ariaLabel == null ? labelId : undefined),
			'aria-describedby': ariaDescribedByProp,
			'aria-orientation': orientation,
			'aria-valuenow': thumbValue,
			'aria-valuetext':
				typeof getAriaValueTextProp === 'function'
					? getAriaValueTextProp(
							formatNumber(thumbValue, locale, formatOptionsRef.current ?? undefined),
							thumbValue,
							index,
						)
					: (ariaValueTextProp ??
						getDefaultAriaValueText(
							sliderValues,
							index,
							formatOptionsRef.current ?? undefined,
							locale,
						)),
			disabled,
			form,
			id: inputId,
			max,
			min,
			name,
			onChange(event: any) {
				handleInputChange(event.currentTarget.valueAsNumber, index, event);
			},
			onFocus(event: any) {
				const isRestoringFocusVisible = restoringFocusVisibleRef.current;
				restoringFocusVisibleRef.current = false;
				setActive(index);
				setFocused(true);
				if (isRestoringFocusVisible) {
					event.stopPropagation();
				}
			},
			onBlur(event: any) {
				if (restoringFocusVisibleRef.current) {
					event.stopPropagation();
					return;
				}
				if (!thumbRef.current) {
					return;
				}
				setActive(-1);
				setTouched(true);
				setFocused(false);
				if (validationMode === 'onBlur') {
					validation.commit(getSliderValue(thumbValue, index, min, max, range, sliderValues));
				}
			},
			onKeyDown(event: any) {
				if (event.defaultPrevented) {
					return;
				}
				if (!ALL_KEYS.has(event.key)) {
					return;
				}
				if (COMPOSITE_KEYS.has(event.key)) {
					event.stopPropagation();
				}
				let newValue = null;
				const roundedValue = roundValueToStep(thumbValue, step, min);
				switch (event.key) {
					case ARROW_UP:
						newValue = getNewValue(roundedValue, event.shiftKey ? largeStep : step, 1, min, max);
						break;
					case ARROW_RIGHT:
						newValue = getNewValue(
							roundedValue,
							event.shiftKey ? largeStep : step,
							rtl ? -1 : 1,
							min,
							max,
						);
						break;
					case ARROW_DOWN:
						newValue = getNewValue(roundedValue, event.shiftKey ? largeStep : step, -1, min, max);
						break;
					case ARROW_LEFT:
						newValue = getNewValue(
							roundedValue,
							event.shiftKey ? largeStep : step,
							rtl ? 1 : -1,
							min,
							max,
						);
						break;
					case PAGE_UP:
						newValue = getNewValue(roundedValue, largeStep, 1, min, max);
						break;
					case PAGE_DOWN:
						newValue = getNewValue(roundedValue, largeStep, -1, min, max);
						break;
					case END:
						newValue = max;
						if (range) {
							newValue = Number.isFinite(sliderValues[index + 1])
								? sliderValues[index + 1] - step * minStepsBetweenValues
								: max;
						}
						break;
					case HOME:
						newValue = min;
						if (range) {
							newValue = Number.isFinite(sliderValues[index - 1])
								? sliderValues[index - 1] + step * minStepsBetweenValues
								: min;
						}
						break;
					default:
						break;
				}
				if (newValue !== null) {
					const input = event.currentTarget as HTMLInputElement;
					if (!matchesFocusVisible(input)) {
						restoringFocusVisibleRef.current = true;
						input.blur();
						(input as any).focus({ preventScroll: true, focusVisible: true });
					}
					handleInputChange(newValue, index, event);
					event.preventDefault();
				}
			},
			step,
			style: {
				...visuallyHidden,
				width: '100%',
				height: '100%',
				writingMode: cssWritingMode,
			},
			tabIndex: tabIndexProp ?? undefined,
			type: 'range',
			// octane: a controlled range input reflects its live value to the `value` ATTRIBUTE
			// (verified vs React) — octane's native attribute write matches, so no freeze/property
			// adaptation is needed here (unlike a controlled TEXT input). Base UI prevents native
			// range interaction (keydown → preventDefault), so the input stays pristine and the
			// attribute drives the property/position.
			value: thumbValue ?? '',
		},
		(props: any) => validation.getValidationProps(disabled, props),
		{ onKeyDown: onKeyDownProp },
	);

	const mergedInputRef = useComposedRefs(
		inputRef,
		validation.inputRef,
		inputRefProp,
		subSlot(slot, 'inputRefs'),
	);

	const inputElement = createElement('input', { ...inputProps, ref: mergedInputRef });

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, listItemRef, thumbRef],
			props: [
				{
					['data-index']: index,
					children: [childrenProp, inputElement],
					id,
					onBlur: onBlurProp,
					onFocus: onFocusProp,
					onPointerDown(event: any) {
						if (disabled) {
							return;
						}
						pressedThumbIndexRef.current = index;
						if (thumbRef.current != null) {
							const axis = orientation === 'horizontal' ? 'x' : 'y';
							const midpoint = getMidpoint(thumbRef.current);
							const offset =
								(orientation === 'horizontal' ? event.clientX : event.clientY) - midpoint[axis];
							pressedThumbCenterOffsetRef.current = offset;
						}
						if (inputRef.current != null && pressedInputRef.current !== inputRef.current) {
							pressedInputRef.current = inputRef.current;
						}
					},
					style: thumbStyle,
				},
				elementProps,
			],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Value -------------------------------------------------------------------

function SliderValue(componentProps: any): any {
	const slot = S('SliderValue');
	const {
		'aria-live': ariaLive = 'off',
		render,
		className,
		children,
		style,
		ref,
		...elementProps
	} = componentProps;
	const { thumbMap, state, values, formatOptionsRef, locale } = useSliderRootContext();

	let htmlFor = '';
	for (const thumbMetadata of thumbMap.values()) {
		if (thumbMetadata?.inputId) {
			htmlFor += `${thumbMetadata.inputId} `;
		}
	}
	const outputFor = htmlFor.trim() === '' ? undefined : htmlFor.trim();

	const formattedValues = useMemo(
		() => {
			const arr = [];
			for (let i = 0; i < values.length; i += 1) {
				arr.push(formatNumber(values[i], locale, formatOptionsRef.current ?? undefined));
			}
			return arr;
		},
		[formatOptionsRef, locale, values],
		subSlot(slot, 'fmt'),
	);

	const defaultDisplayValue = values
		.map((v: number, i: number) => formattedValues[i] || v)
		.join(' – ');

	return useRenderElement(
		'output',
		{ render, className, style },
		{
			state,
			ref,
			props: [
				{
					'aria-live': ariaLive,
					children:
						typeof children === 'function'
							? children(formattedValues, values)
							: defaultDisplayValue,
					htmlFor: outputFor,
				},
				elementProps,
			],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Label -------------------------------------------------------------------

function SliderLabel(componentProps: any): any {
	const slot = S('SliderLabel');
	const { render, className, style, ref, ...elementProps } = componentProps;
	delete (elementProps as any).id;

	const { state, setLabelId, controlRef, rootLabelId } = useSliderRootContext();

	function focusControl(event: any, controlId: string | null | undefined) {
		if (controlId) {
			const controlElement = ownerDocument(event.currentTarget).getElementById(controlId);
			if (isHTMLElementNode(controlElement)) {
				focusElementWithVisible(controlElement);
				return;
			}
		}
		const fallbackInputs = controlRef.current?.querySelectorAll('input[type="range"]');
		const fallbackInput = fallbackInputs?.length === 1 ? fallbackInputs[0] : null;
		if (isHTMLElementNode(fallbackInput)) {
			focusElementWithVisible(fallbackInput);
		}
	}

	const labelProps = useLabel(
		{ id: rootLabelId, setLabelId, focusControl },
		subSlot(slot, 'label'),
	);

	return useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [labelProps, elementProps],
			stateAttributesMapping: sliderStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Namespace (mirrors `export * as Slider`) --------------------------------

export const Slider = {
	Root: SliderRoot,
	Value: SliderValue,
	Control: SliderControl,
	Track: SliderTrack,
	Indicator: SliderIndicator,
	Thumb: SliderThumb,
	Label: SliderLabel,
};
