/** @jsxImportSource @octanejs/three/intrinsics */
import { useFrame } from '@octanejs/three';
import {
	createContext,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';

type PerformanceMonitorHookApi = {
	onIncline: (api: PerformanceMonitorApi) => void;
	onDecline: (api: PerformanceMonitorApi) => void;
	onChange: (api: PerformanceMonitorApi) => void;
	onFallback: (api: PerformanceMonitorApi) => void;
};

export type PerformanceMonitorApi = {
	fps: number;
	factor: number;
	refreshrate: number;
	frames: number[];
	averages: number[];
	index: number;
	flipped: number;
	fallback: boolean;
	subscriptions: Map<symbol, Partial<PerformanceMonitorHookApi>>;
	subscribe: (ref: { current: Partial<PerformanceMonitorHookApi> }) => () => void;
};

export type PerformanceMonitorProps = {
	ms?: number;
	iterations?: number;
	threshold?: number;
	bounds?: (refreshrate: number) => [lower: number, upper: number];
	flipflops?: number;
	factor?: number;
	step?: number;
	onIncline?: (api: PerformanceMonitorApi) => void;
	onDecline?: (api: PerformanceMonitorApi) => void;
	onChange?: (api: PerformanceMonitorApi) => void;
	onFallback?: (api: PerformanceMonitorApi) => void;
	children?: OctaneNode;
};

const context = createContext<PerformanceMonitorApi>(null!);

export function PerformanceMonitor({
	iterations = 10,
	ms = 250,
	threshold = 0.75,
	step = 0.1,
	factor: initialFactor = 0.5,
	flipflops = Infinity,
	bounds = (refreshrate) => (refreshrate > 100 ? [60, 100] : [40, 60]),
	onIncline,
	onDecline,
	onChange,
	onFallback,
	children,
}: PerformanceMonitorProps) @{
	const decimalPlacesRatio = Math.pow(10, 0);
	const [api] = useState<PerformanceMonitorApi>(() => ({
		fps: 0,
		index: 0,
		factor: initialFactor,
		flipped: 0,
		refreshrate: 0,
		fallback: false,
		frames: [],
		averages: [],
		subscriptions: new Map(),
		subscribe: (ref) => {
			const key = Symbol();
			api.subscriptions.set(key, ref.current);
			return () => void api.subscriptions.delete(key);
		},
	}));

	let lastFactor = 0;
	useFrame(() => {
		const { frames, averages } = api;
		if (api.fallback) return;
		if (averages.length < iterations) {
			frames.push(performance.now());
			const msPassed = frames[frames.length - 1] - frames[0];
			if (msPassed >= ms) {
				api.fps =
					Math.round((frames.length / msPassed) * 1000 * decimalPlacesRatio) /
					decimalPlacesRatio;
				api.refreshrate = Math.max(api.refreshrate, api.fps);
				averages[api.index++ % iterations] = api.fps;
				if (averages.length === iterations) {
					const [lower, upper] = bounds(api.refreshrate);
					const upperBounds = averages.filter((value) => value >= upper);
					const lowerBounds = averages.filter((value) => value < lower);
					if (upperBounds.length > iterations * threshold) {
						api.factor = Math.min(1, api.factor + step);
						api.flipped++;
						onIncline?.(api);
						api.subscriptions.forEach((value) => value.onIncline?.(api));
					}
					if (lowerBounds.length > iterations * threshold) {
						api.factor = Math.max(0, api.factor - step);
						api.flipped++;
						onDecline?.(api);
						api.subscriptions.forEach((value) => value.onDecline?.(api));
					}
					if (lastFactor !== api.factor) {
						lastFactor = api.factor;
						onChange?.(api);
						api.subscriptions.forEach((value) => value.onChange?.(api));
					}
					if (api.flipped > flipflops && !api.fallback) {
						api.fallback = true;
						onFallback?.(api);
						api.subscriptions.forEach((value) => value.onFallback?.(api));
					}
					api.averages = [];
				}
				api.frames = [];
			}
		}
	});
	<context.Provider value={api}>{children}</context.Provider>
}

export function usePerformanceMonitor({
	onIncline,
	onDecline,
	onChange,
	onFallback,
}: Partial<PerformanceMonitorHookApi>): void {
	const api = useContext(context);
	const ref = useRef({ onIncline, onDecline, onChange, onFallback });
	useLayoutEffect(() => {
		ref.current.onIncline = onIncline;
		ref.current.onDecline = onDecline;
		ref.current.onChange = onChange;
		ref.current.onFallback = onFallback;
	}, [onIncline, onDecline, onChange, onFallback]);
	useLayoutEffect(() => api.subscribe(ref), [api]);
}
