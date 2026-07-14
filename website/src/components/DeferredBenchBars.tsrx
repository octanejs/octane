// Keep the home-page chart out of the startup path without giving up the full
// Recharts experience. SSR and hydration render the dependency-free SVG/table.
// Shortly before the section scrolls into view, Activity reveals a lazy chart;
// when it leaves the near-viewport range, Activity preserves that chart while a
// same-size static fallback keeps the document geometry stable.
import { Activity, lazy, useEffect, useRef, useState } from 'octane';
import type { BenchCard } from '../content/benchmarks.ts';
import { HomeBenchBars } from './HomeBenchBars.tsrx';

const LazyBenchBars = lazy(
	() => import('./BenchBars.tsrx').then((module) => ({ default: module.BenchBars })),
);

export function DeferredBenchBars(props: { card: BenchCard; width?: number }) @{
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [isNear, setIsNear] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);

	useEffect(() => {
		const host = hostRef.current;
		if (!host || typeof IntersectionObserver === 'undefined') {
			setIsNear(true);
			setHasLoaded(true);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			const near = entries[0]?.isIntersecting === true;
			setIsNear(near);
			if (near) setHasLoaded(true);
		}, { rootMargin: '400px 0px' });
		observer.observe(host);
		return () => observer.disconnect();
	});

	<div class="deferred-bench" ref={hostRef}>
		@if (!isNear) {
			<HomeBenchBars card={props.card} />
		}
		<Activity mode={isNear && hasLoaded ? 'visible' : 'hidden'}>
			@if (hasLoaded) {
				@try {
					<LazyBenchBars card={props.card} showValues={true} width={props.width ?? 1100} />
				} @pending {
					<HomeBenchBars card={props.card} />
				}
			}
		</Activity>
		<style>
			.deferred-bench {
				min-width: 0;
			}
		</style>
	</div>
}
