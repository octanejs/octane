import {
	engine,
	Timeline,
	type KeyEvent,
	type PasteEvent,
	type Selection,
	type TimelineOptions,
} from '@opentui/core';
import { useEffect, useEffectEvent, useState } from 'octane/universal';
import { useAppContext } from './context.js';
import { splitSlot, subSlot } from './slots.js';

export interface UseKeyboardOptions {
	/** Include release events; the callback then receives keyrelease events too. */
	release?: boolean;
}

export function useRenderer() {
	const { renderer } = useAppContext();
	if (renderer === null) throw new Error('OpenTUI renderer not found.');
	return renderer;
}

export function useKeyboard(handler: (key: KeyEvent) => void, options?: UseKeyboardOptions): void;
export function useKeyboard(handler: (key: KeyEvent) => void, ...args: unknown[]): void {
	const [userArgs, slot] = splitSlot(args);
	const options = (userArgs[0] as UseKeyboardOptions | undefined) ?? {};
	const { keyHandler } = useAppContext();
	const stableHandler = useEffectEvent(handler, subSlot(slot, 'useKeyboard:handler'));
	useEffect(
		() => {
			keyHandler?.on('keypress', stableHandler);
			if (options.release === true) keyHandler?.on('keyrelease', stableHandler);
			return () => {
				keyHandler?.off('keypress', stableHandler);
				if (options.release === true) keyHandler?.off('keyrelease', stableHandler);
			};
		},
		[keyHandler, options.release, stableHandler],
		subSlot(slot, 'useKeyboard:effect'),
	);
}

export function usePaste(handler: (event: PasteEvent) => void): void;
export function usePaste(handler: (event: PasteEvent) => void, slot?: symbol): void {
	const { keyHandler } = useAppContext();
	const stableHandler = useEffectEvent(handler, subSlot(slot, 'usePaste:handler'));
	useEffect(
		() => {
			keyHandler?.on('paste', stableHandler);
			return () => keyHandler?.off('paste', stableHandler);
		},
		[keyHandler, stableHandler],
		subSlot(slot, 'usePaste:effect'),
	);
}

export function useFocus(handler: () => void): void;
export function useFocus(handler: () => void, slot?: symbol): void {
	const renderer = useRenderer();
	const stableHandler = useEffectEvent(handler, subSlot(slot, 'useFocus:handler'));
	useEffect(
		() => {
			renderer.on('focus', stableHandler);
			return () => renderer.off('focus', stableHandler);
		},
		[renderer, stableHandler],
		subSlot(slot, 'useFocus:effect'),
	);
}

export function useBlur(handler: () => void): void;
export function useBlur(handler: () => void, slot?: symbol): void {
	const renderer = useRenderer();
	const stableHandler = useEffectEvent(handler, subSlot(slot, 'useBlur:handler'));
	useEffect(
		() => {
			renderer.on('blur', stableHandler);
			return () => renderer.off('blur', stableHandler);
		},
		[renderer, stableHandler],
		subSlot(slot, 'useBlur:effect'),
	);
}

export function useSelectionHandler(handler: (selection: Selection) => void): void;
export function useSelectionHandler(handler: (selection: Selection) => void, slot?: symbol): void {
	const renderer = useRenderer();
	const stableHandler = useEffectEvent(handler, subSlot(slot, 'useSelection:handler'));
	useEffect(
		() => {
			renderer.on('selection', stableHandler);
			return () => renderer.off('selection', stableHandler);
		},
		[renderer, stableHandler],
		subSlot(slot, 'useSelection:effect'),
	);
}

export function useOnResize(
	callback: (width: number, height: number) => void,
): ReturnType<typeof useRenderer>;
export function useOnResize(
	callback: (width: number, height: number) => void,
	slot: symbol,
): ReturnType<typeof useRenderer>;
export function useOnResize(
	callback: (width: number, height: number) => void,
	slot?: symbol,
): ReturnType<typeof useRenderer> {
	const renderer = useRenderer();
	const stableCallback = useEffectEvent(callback, subSlot(slot, 'useResize:handler'));
	useEffect(
		() => {
			renderer.on('resize', stableCallback);
			return () => {
				renderer.off('resize', stableCallback);
			};
		},
		[renderer, stableCallback],
		subSlot(slot, 'useResize:effect'),
	);
	return renderer;
}

export interface TerminalDimensions {
	width: number;
	height: number;
}

export function useTerminalDimensions(): TerminalDimensions;
export function useTerminalDimensions(...args: unknown[]): TerminalDimensions {
	const [, slot] = splitSlot(args);
	const renderer = useRenderer();
	const [dimensions, setDimensions] = useState<TerminalDimensions>(
		() => ({ width: renderer.width, height: renderer.height }),
		subSlot(slot, 'useTerminalDimensions:state'),
	);
	const resizeSlot = subSlot(slot, 'useTerminalDimensions:resize');
	const updateDimensions = (width: number, height: number) => setDimensions({ width, height });
	if (resizeSlot === undefined) useOnResize(updateDimensions);
	else useOnResize(updateDimensions, resizeSlot);
	return dimensions;
}

export function useTimeline(options?: TimelineOptions): Timeline;
export function useTimeline(...args: unknown[]): Timeline {
	const [userArgs, slot] = splitSlot(args);
	const options = (userArgs[0] as TimelineOptions | undefined) ?? {};
	const [timeline] = useState(() => new Timeline(options), subSlot(slot, 'useTimeline:timeline'));
	const [autoplay] = useState(
		() => options.autoplay !== false,
		subSlot(slot, 'useTimeline:autoplay'),
	);
	useEffect(
		() => {
			if (autoplay) timeline.play();
			engine.register(timeline);
			return () => {
				timeline.pause();
				engine.unregister(timeline);
			};
		},
		[autoplay, timeline],
		subSlot(slot, 'useTimeline:effect'),
	);
	return timeline;
}
