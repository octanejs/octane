import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'octane';
import { useProgress } from '../core/Progress.three.tsrx';

type Style = Record<string, string | number>;
interface LoaderOptions {
	containerStyles: Style;
	innerStyles: Style;
	barStyles: Style;
	dataStyles: Style;
	dataInterpolation: (progress: number) => string;
	initialState: (active: boolean) => boolean;
}

const defaultDataInterpolation = (progress: number) => `Loading ${progress.toFixed(2)}%`;

export function Loader({
	containerStyles,
	innerStyles,
	barStyles,
	dataStyles,
	dataInterpolation = defaultDataInterpolation,
	initialState = (active: boolean) => active,
}: Partial<LoaderOptions>) {
	const { active, progress } = useSyncExternalStore(useProgress.subscribe, useProgress.getState, useProgress.getInitialState);
	const progressRef = useRef(0);
	const rafRef = useRef(0);
	const progressSpanRef = useRef<HTMLSpanElement | null>(null);
	const [shown, setShown] = useState(initialState(active));
	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		if (active !== shown) timeout = setTimeout(() => setShown(active), 300);
		return () => { if (timeout !== undefined) clearTimeout(timeout); };
	}, [shown, active]);
	const updateProgress = useCallback(() => {
		if (!progressSpanRef.current) return;
		progressRef.current += (progress - progressRef.current) / 2;
		if (progressRef.current > 0.95 * progress || progress === 100) progressRef.current = progress;
		progressSpanRef.current.innerText = dataInterpolation(progressRef.current);
		if (progressRef.current < progress) rafRef.current = requestAnimationFrame(updateProgress);
	}, [dataInterpolation, progress]);
	useEffect(() => {
		updateProgress();
		return () => cancelAnimationFrame(rafRef.current);
	}, [updateProgress]);
	if (!shown) return null;
	return <div style={{ ...styles.container, opacity: active ? 1 : 0, ...containerStyles }}>
		<div>
			<div style={{ ...styles.inner, ...innerStyles }}>
				<div style={{ ...styles.bar, transform: `scaleX(${progress / 100})`, ...barStyles }} />
				<span ref={progressSpanRef} style={{ ...styles.data, ...dataStyles }} />
			</div>
		</div>
	</div>;
}

const styles: Record<string, Style> = {
	container: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 300ms ease', zIndex: 1000 },
	inner: { width: 100, height: 3, background: '#272727', textAlign: 'center' },
	bar: { height: 3, width: '100%', background: 'white', transition: 'transform 200ms', transformOrigin: 'left center' },
	data: { display: 'inline-block', position: 'relative', fontVariantNumeric: 'tabular-nums', marginTop: '0.8em', color: '#f0f0f0', fontSize: '0.6em', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Helvetica Neue", Helvetica, Arial, Roboto, Ubuntu, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"', whiteSpace: 'nowrap' },
};
