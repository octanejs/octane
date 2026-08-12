/** @jsxImportSource octane */
import { useEffectEvent, useLayoutEffect, useMemo } from 'octane';

type Ref<T> = ((value: T | null) => void) | { current: T | null } | null | undefined;

export function useComposedRef<T>(internal: { current: T | null }, external: Ref<T>) {
	return useMemo(
		() => (external == null ? internal : ([internal, external] as const)),
		[internal, external],
	);
}

function useListener<K extends keyof WindowEventMap>(
	target: Window,
	type: K,
	listener: (event: WindowEventMap[K]) => void,
): void;
function useListener<K extends keyof HTMLElementEventMap>(
	target: HTMLElement,
	type: K,
	listener: (event: HTMLElementEventMap[K]) => void,
): void;
function useListener<K extends keyof FontFaceSetEventMap>(
	target: FontFaceSet,
	type: K,
	listener: (event: FontFaceSetEventMap[K]) => void,
): void;
function useListener(
	target: EventTarget | undefined,
	type: string,
	listener: (event: Event) => void,
): void {
	const latestListener = useEffectEvent(listener);
	useLayoutEffect(() => {
		if (!target) return;
		const handler = (event: Event) => latestListener(event);
		target.addEventListener(type, handler);
		return () => target.removeEventListener(type, handler);
	}, []);
}

export const useFormResetListener = (
	ref: { current: HTMLTextAreaElement | null },
	listener: (event: Event) => void,
) =>
	useListener(document.body, 'reset', (event) => {
		if (ref.current?.form === event.target) listener(event);
	});
export const useWindowResizeListener = (listener: (event: UIEvent) => void) =>
	useListener(window, 'resize', listener);
export const useFontsLoadedListener = (listener: (event: FontFaceSetLoadEvent) => void) =>
	useListener(document.fonts, 'loadingdone', listener);
