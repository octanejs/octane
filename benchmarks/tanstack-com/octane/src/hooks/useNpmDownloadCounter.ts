import { useEffect, useRef, useCallback } from 'octane';
import type { NpmStats } from '~/utils/stats.server';

type CounterData = {
	baseCount: number;
	ratePerDay: number;
	updatedAt?: number;
};

/**
 * Hook to animate NPM download count using direct DOM updates.
 * Uses requestAnimationFrame for smooth visible-page updates without React renders.
 */
export function useNpmDownloadCounter(npmData: NpmStats): React.RefCallback<HTMLElement> {
	const baseCount = npmData.totalDownloads ?? 0;
	const ratePerDay = npmData.ratePerDay ?? 0;
	const updatedAt = npmData.updatedAt;

	const dataRef = useRef<CounterData>({
		baseCount,
		ratePerDay,
		updatedAt,
	});
	const frameRef = useRef<number | undefined>(undefined);
	const elementRef = useRef<HTMLElement | null>(null);
	const lastCountRef = useRef<number | null>(null);
	const mountedAtRef = useRef<number | undefined>(undefined);

	dataRef.current = {
		baseCount,
		ratePerDay,
		updatedAt,
	};

	const getCount = useCallback(() => {
		const data = dataRef.current;
		const msPerDay = 24 * 60 * 60 * 1000;
		const ratePerMs = data.ratePerDay / msPerDay;
		const startedAt = data.updatedAt ?? mountedAtRef.current ?? Date.now();
		const elapsedMs = Date.now() - startedAt;

		return Math.round(data.baseCount + ratePerMs * elapsedMs);
	}, []);

	const canAnimate = useCallback(() => {
		const data = dataRef.current;

		return data.ratePerDay > 0 && Number.isFinite(data.ratePerDay) && !!elementRef.current;
	}, []);

	const updateCount = useCallback(() => {
		if (elementRef.current) {
			const count = getCount();

			if (count !== lastCountRef.current) {
				lastCountRef.current = count;
				elementRef.current.textContent = count.toLocaleString();
			}
		}
	}, [getCount]);

	const stopFrame = useCallback(() => {
		if (frameRef.current !== undefined) {
			window.cancelAnimationFrame(frameRef.current);
			frameRef.current = undefined;
		}
	}, []);

	const tick = useCallback(() => {
		frameRef.current = undefined;

		if (document.visibilityState === 'hidden' || !canAnimate()) {
			return;
		}

		updateCount();
		frameRef.current = window.requestAnimationFrame(tick);
	}, [canAnimate, updateCount]);

	const startFrame = useCallback(() => {
		if (!canAnimate() || frameRef.current !== undefined || document.visibilityState === 'hidden') {
			return;
		}

		frameRef.current = window.requestAnimationFrame(tick);
	}, [canAnimate, tick]);

	useEffect(() => {
		updateCount();

		if (!canAnimate()) {
			stopFrame();
			return;
		}

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				stopFrame();
				return;
			}

			updateCount();
			startFrame();
		};

		const handleResume = () => {
			updateCount();
			startFrame();
		};

		updateCount();
		startFrame();
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', handleResume);
		window.addEventListener('pageshow', handleResume);

		return () => {
			stopFrame();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', handleResume);
			window.removeEventListener('pageshow', handleResume);
		};
	}, [baseCount, canAnimate, ratePerDay, startFrame, stopFrame, updatedAt, updateCount]);

	const refCallback = useCallback(
		(node: HTMLElement | null) => {
			elementRef.current = node;
			if (node) {
				mountedAtRef.current = Date.now();
				updateCount();
				startFrame();
				return;
			}

			stopFrame();
		},
		[startFrame, stopFrame, updateCount],
	);

	return refCallback;
}
