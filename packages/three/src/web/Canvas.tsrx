import { useLayoutEffect, useRef, useState } from 'octane';
import { createUniversalHostBoundary } from 'octane/universal';
import type { RendererRegion } from 'octane/universal';
import { createRoot, createThreeBoundaryMount } from '../core/root.js';
import type { RenderProps, ThreeBoundaryMount, ThreeRoot } from '../core/root.js';
import type { Size } from '../core/store.js';
import { observeCanvasSize } from './measure.js';
import type { ResizeOptions } from './measure.js';

const ThreeBoundary = createUniversalHostBoundary('three');
const DEFAULT_RESIZE_OPTIONS: ResizeOptions = Object.freeze({
	scroll: true,
	debounce: Object.freeze({ scroll: 50, resize: 0 }),
});

export type CanvasStyle = Readonly<Record<string, string | number | null | undefined>>;
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
	/** The pointer-event source is accepted now and becomes active in Milestone 4. */
	eventSource?: HTMLElement | { current: HTMLElement | null };
	/** Coordinate prefix for the Milestone 4 pointer-event manager. */
	eventPrefix?: 'offset' | 'client' | 'page' | 'layer' | 'screen';
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

/** A measured DOM canvas whose authored children execute in the Three renderer. */
export function Canvas({
	ref,
	children,
	fallback,
	resize,
	style,
	gl,
	events,
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
	const [size, setSize] = useState<Size | null>(null);
	const [boundaryMount, setBoundaryMount] = useState<ThreeBoundaryMount | null>(null);
	const [error, setError] = useState<Error | null>(null);

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
		if (eventSource !== undefined || eventPrefix !== undefined) {
			setError(
				new Error('@octanejs/three: Canvas eventSource and eventPrefix are not available in the technical preview; they land in Milestone 4.'),
			);
			return () => {
				cancelled = true;
			};
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
			onPointerMissed,
			onCreated,
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
	]);

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
