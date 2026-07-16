import { useLayoutEffect, useRef, useState } from 'octane';
import { createUniversalHostBoundary } from 'octane/universal';
import type { RendererRegion } from 'octane/universal';
import type { ComputeFunction, DomEvent } from '../core/events.js';
import { createRoot, createThreeBoundaryMount } from '../core/root.js';
import type { RenderProps, ThreeBoundaryMount, ThreeRoot } from '../core/root.js';
import type { RootState, Size } from '../core/store.js';
import { createPointerEvents } from './events.js';
import { observeCanvasSize } from './measure.js';
import type { ResizeOptions } from './measure.js';

const ThreeBoundary = createUniversalHostBoundary('three');
const DEFAULT_RESIZE_OPTIONS: ResizeOptions = Object.freeze({
	scroll: true,
	debounce: Object.freeze({ scroll: 50, resize: 0 }),
});

export type CanvasStyle = Readonly<Record<string, string | number | null | undefined>>;
type EventPrefix = 'offset' | 'client' | 'page' | 'layer' | 'screen';
export type CanvasRef =
	| { current: HTMLCanvasElement | null }
	| ((canvas: HTMLCanvasElement | null) => void | (() => void))
	| readonly CanvasRef[]
	| null;

export interface CanvasProps extends Omit<RenderProps<HTMLCanvasElement>, 'size'>, Record<
	string,
	unknown
> {
	/** Compiler-owned Three renderer region. Application JSX is lowered into this payload. */
	children?: RendererRegion;
	/** Fallback content rendered as native canvas fallback DOM. */
	fallback?: unknown;
	/** DOM measurement options compatible with the R3F Canvas surface. */
	resize?: ResizeOptions;
	/** Event subscription target. Defaults to the outer Canvas wrapper. */
	eventSource?: HTMLElement | { current: HTMLElement | null };
	/** Coordinate prefix used to normalize pointer positions. Defaults to `offset`. */
	eventPrefix?: EventPrefix;
	ref?: CanvasRef;
	style?: CanvasStyle;
}

function sameSize(previous: Size | null, next: Size): boolean {
	return previous !== null && previous.width === next.width && previous.height === next.height &&
		previous.top === next.top &&
		previous.left === next.left;
}

function configurationError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error(`@octanejs/three: Canvas configuration failed: ${String(error)}`);
}

interface CanvasEventBinding {
	initialized: boolean;
	restoreCompute?: ComputeFunction;
	source?: CanvasProps['eventSource'];
	target?: HTMLElement | null;
	prefix?: EventPrefix;
	prefixCompute?: ComputeFunction;
}

function resolveEventSource(
	source: CanvasProps['eventSource'],
	wrapper: HTMLDivElement | null,
): HTMLElement | null {
	if (source === undefined) return wrapper;
	return 'current' in source ? source.current : source;
}

function createPrefixCompute(prefix: EventPrefix): ComputeFunction {
	return (event: DomEvent, state: RootState) => {
		const x = event[`${prefix}X` as keyof DomEvent] as number;
		const y = event[`${prefix}Y` as keyof DomEvent] as number;
		state.pointer.set((x / state.size.width) * 2 - 1, -(y / state.size.height) * 2 + 1);
		state.raycaster.setFromCamera(state.pointer, state.camera);
	};
}

function bindCanvasEvents(
	state: RootState,
	source: CanvasProps['eventSource'],
	wrapper: HTMLDivElement | null,
	prefix: EventPrefix | undefined,
	binding: CanvasEventBinding,
): void {
	let current = state.get();
	const target = resolveEventSource(source, wrapper);
	if (!binding.initialized || binding.source !== source || binding.target !== target) {
		binding.source = source;
		binding.target = target;
		if (target === null) current.events.disconnect?.();
		else if (current.events.connected !== target) current.events.connect?.(target);
		current = state.get();
	}

	if (!binding.initialized) binding.initialized = true;
	if (binding.prefix !== prefix) {
		const previousPrefixCompute = binding.prefixCompute;
		if (binding.prefix === undefined || current.events.compute !== previousPrefixCompute) {
			binding.restoreCompute = current.events.compute;
		}
		binding.prefix = prefix;
		if (prefix === undefined) {
			binding.prefixCompute = undefined;
			if (current.events.compute === previousPrefixCompute) {
				current.setEvents({ compute: binding.restoreCompute });
			}
		} else {
			const prefixCompute = createPrefixCompute(prefix);
			binding.prefixCompute = prefixCompute;
			current.setEvents({ compute: prefixCompute });
		}
	}
}

/** A measured DOM canvas whose authored children execute in the Three renderer. */
export function Canvas({
	ref,
	children,
	fallback,
	resize,
	style,
	gl,
	events = createPointerEvents,
	eventSource,
	eventPrefix,
	shadows,
	linear,
	flat,
	legacy,
	orthographic,
	frameloop,
	dpr,
	performance,
	raycaster,
	camera,
	scene,
	onPointerMissed,
	onCreated,
	...domProps
}: CanvasProps) {
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rootRef = useRef<ThreeRoot<HTMLCanvasElement> | null>(null);
	const eventSourceRef = useRef<CanvasProps['eventSource']>(eventSource);
	const eventPrefixRef = useRef<EventPrefix | undefined>(eventPrefix);
	const onCreatedRef = useRef(onCreated);
	const onPointerMissedRef = useRef(onPointerMissed);
	const eventBindingRef = useRef<CanvasEventBinding>({ initialized: false });
	const createdHandlerRef = useRef<((state: RootState) => void) | null>(null);
	const pointerMissedHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
	const [size, setSize] = useState<Size | null>(null);
	const [boundaryMount, setBoundaryMount] = useState<ThreeBoundaryMount | null>(null);
	const [error, setError] = useState<Error | null>(null);
	eventSourceRef.current = eventSource;
	eventPrefixRef.current = eventPrefix;
	onCreatedRef.current = onCreated;
	onPointerMissedRef.current = onPointerMissed;
	if (createdHandlerRef.current === null) {
		createdHandlerRef.current = (state) => {
			bindCanvasEvents(
				state,
				eventSourceRef.current,
				wrapperRef.current,
				eventPrefixRef.current,
				eventBindingRef.current,
			);
			onCreatedRef.current?.(state.get());
		};
	}
	if (pointerMissedHandlerRef.current === null) {
		pointerMissedHandlerRef.current = (event) => onPointerMissedRef.current?.(event);
	}

	if (error !== null) throw error;

	useLayoutEffect(() => {
		const wrapper = wrapperRef.current;
		if (wrapper === null) return;
		return observeCanvasSize(wrapper, resize ?? DEFAULT_RESIZE_OPTIONS, (next) => {
			setSize((previous) => (sameSize(previous, next) ? previous : next));
		});
	}, [resize]);

	useLayoutEffect(() => {
		return () => {
			const root = rootRef.current;
			rootRef.current = null;
			root?.unmount();
		};
	}, []);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null || size === null || size.width <= 0 || size.height <= 0) return;
		let cancelled = false;
		let root = rootRef.current;
		if (root === null) {
			root = createRoot(canvas);
			rootRef.current = root;
		}
		void root.configure({
			gl,
			events,
			shadows,
			linear,
			flat,
			legacy,
			orthographic,
			frameloop,
			dpr,
			performance,
			raycaster,
			camera,
			scene,
			onPointerMissed: pointerMissedHandlerRef.current,
			onCreated: createdHandlerRef.current,
			size,
		}).then(() => {
			if (cancelled) return;
			setBoundaryMount(createThreeBoundaryMount(root));
		}).catch((reason) => {
			if (!cancelled) setError(configurationError(reason));
		});
		return () => {
			cancelled = true;
		};
	}, [
		size,
		gl,
		events,
		shadows,
		linear,
		flat,
		legacy,
		orthographic,
		frameloop,
		dpr,
		performance,
		raycaster,
		camera,
		scene,
	]);

	useLayoutEffect(() => {
		const root = rootRef.current;
		if (boundaryMount === null || root === null) return;
		bindCanvasEvents(
			root.store.getState(),
			eventSource,
			wrapperRef.current,
			eventPrefix,
			eventBindingRef.current,
		);
	}, [boundaryMount, eventSource, eventPrefix]);

	const renderedBoundaryMount: ThreeBoundaryMount | null =
		boundaryMount === null
			? null
			: {
					...boundaryMount,
					props: { ...boundaryMount.props, region: children },
				};

	const wrapperStyle: CanvasStyle = {
		position: 'relative',
		width: '100%',
		height: '100%',
		overflow: 'hidden',
		pointerEvents: eventSource === undefined ? 'auto' : 'none',
		...style,
	};

	return <div ref={wrapperRef} style={wrapperStyle} {...domProps}>
		<div style={{ width: '100%', height: '100%' }}>
			<canvas ref={[canvasRef, ref]} style={{ display: 'block' }}>{fallback}</canvas>
		</div>
		{renderedBoundaryMount === null
			? null
			: <ThreeBoundary
					root={renderedBoundaryMount.root}
					component={renderedBoundaryMount.component}
					props={renderedBoundaryMount.props}
				/>}
	</div>;
}
