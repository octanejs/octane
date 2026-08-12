import { useInView } from '@octanejs/intersection-observer';

export function IntersectionObserverDemo() @{
	const { ref, inView, entry } = useInView({ threshold: 0.5 });
	<div style={{ display: 'grid', gap: '1rem', maxHeight: '65vh', overflow: 'auto' }}>
		<div
			style={{
				minHeight: '70vh',
				display: 'grid',
				placeItems: 'center',
				border: '1px dashed var(--border)',
				borderRadius: '0.75rem',
			}}
		>
			Scroll this panel to the target.
		</div>
		<section
			ref={ref}
			data-testid="intersection-target"
			data-in-view={inView ? 'true' : 'false'}
			style={{
				minHeight: '12rem',
				display: 'grid',
				placeItems: 'center',
				borderRadius: '0.75rem',
				background: inView ? 'var(--primary)' : 'var(--muted)',
				color: inView ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
				transition: 'background 180ms ease, color 180ms ease',
			}}
		>
			<strong>
				{inView ? 'Target is at least 50% visible' : 'Target is outside the threshold'}
			</strong>
			<small>{`ratio: ${(entry?.intersectionRatio ?? 0).toFixed(2)}`}</small>
		</section>
	</div>
}
