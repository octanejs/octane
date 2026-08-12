import isBrowser from '#is-browser';
import isDevelopment from '#is-development';
import { useLayoutEffect, useRef } from 'octane';
import type { JSX } from 'octane/jsx-runtime';
import calculateNodeHeight from './calculateNodeHeight.js';
import getSizingData, { type SizingData } from './getSizingData.js';
import {
	useComposedRef,
	useFontsLoadedListener,
	useFormResetListener,
	useWindowResizeListener,
} from './hooks.js';
import { noop } from './utils.js';

type NativeTextareaProps = JSX.IntrinsicElements['textarea'];
type TextareaStyle =
	Omit<Exclude<NonNullable<NativeTextareaProps['style']>, string>, 'maxHeight' | 'minHeight'> & {
		height?: number;
	};
type TextareaRef =
	((value: HTMLTextAreaElement | null) => void) | { current: HTMLTextAreaElement | null } | null;
// OCTANE DIVERGENCE[native-input-event][differential:input]
type TextareaAutosizeChangeEvent =
	InputEvent & {
		currentTarget: HTMLTextAreaElement;
		target: HTMLTextAreaElement;
	};
export type TextareaHeightChangeMeta = { rowHeight: number };
export interface TextareaAutosizeProps extends Omit<
	NativeTextareaProps,
	'style' | 'onChange' | 'onChangeCapture' | 'ref'
> {
	maxRows?: number;
	minRows?: number;
	onHeightChange?: (height: number, meta: TextareaHeightChangeMeta) => void;
	cacheMeasurements?: boolean;
	style?: TextareaStyle;
	onChange?: (event: TextareaAutosizeChangeEvent) => void;
	onChangeCapture?: (event: TextareaAutosizeChangeEvent) => void;
	ref?: TextareaRef;
}

export default function TextareaAutosize(
	{
		cacheMeasurements,
		maxRows,
		minRows,
		onChange = noop,
		onChangeCapture = noop,
		onHeightChange = noop,
		onInput,
		onInputCapture,
		ref: userRef,
		...props
	}: TextareaAutosizeProps = {},
) @{
	if (isDevelopment && props.style) {
		if (
			'maxHeight' in props.style
		) throw new Error('Using `style.maxHeight` for <TextareaAutosize/> is not supported. Please use `maxRows`.');
		if (
			'minHeight' in props.style
		) throw new Error('Using `style.minHeight` for <TextareaAutosize/> is not supported. Please use `minRows`.');
	}
	const isControlled = props.value !== undefined;
	const libRef = useRef<HTMLTextAreaElement | null>(null);
	const ref = useComposedRef(libRef, userRef);
	const heightRef = useRef(0);
	const measurementsCacheRef = useRef<SizingData | undefined>(undefined);
	const resizeTextarea = () => {
		const node = libRef.current;
		if (!node) return;
		const sizingData =
			cacheMeasurements && measurementsCacheRef.current
				? measurementsCacheRef.current
				: getSizingData(node);
		if (!sizingData) return;
		measurementsCacheRef.current = sizingData;
		const [height, rowHeight] = calculateNodeHeight(
			sizingData,
			node.value || node.placeholder || 'x',
			minRows,
			maxRows,
		);
		if (heightRef.current !== height) {
			heightRef.current = height;
			node.style.setProperty('height', `${height}px`, 'important');
			onHeightChange(height, { rowHeight });
		}
	};
	const handleInput: NonNullable<NativeTextareaProps['onInput']> = (event) => {
		onInput?.(event);
		onChangeCapture(event as TextareaAutosizeChangeEvent);
		if (!isControlled) resizeTextarea();
		onChange(event as TextareaAutosizeChangeEvent);
	};
	if (isBrowser) {
		useLayoutEffect(resizeTextarea, null);
		useFormResetListener(libRef, () => {
			const node = libRef.current;
			if (isControlled || !node) return;
			const currentValue = node.value;
			requestAnimationFrame(() => {
				if (libRef.current && currentValue !== libRef.current.value) resizeTextarea();
			});
		});
		useWindowResizeListener(resizeTextarea);
		useFontsLoadedListener(resizeTextarea);
	}
	<textarea {...props} onInput={handleInput} onInputCapture={onInputCapture} ref={ref} />
}
