import { Manager, Popper, Reference } from '@octanejs/popper';
import { useState } from 'octane';

export function PopperDemo() {
	const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
	return <div>
		<h2 class="demo-title">react-popper on Octane</h2>
		<p class="demo-blurb">The original render-prop contract, backed by Popper Core.</p>
		<button
			class="button"
			onClick={() => setPlacement((value) => value === 'top' ? 'bottom' : 'top')}
		>
			Toggle placement
		</button>
		<div class="panel" style={{ minHeight: '12rem', display: 'grid', placeItems: 'center' }}>
			<Manager>
				<Reference>
					{({ ref }) => <button ref={ref} class="button">Anchor</button>}
				</Reference>
				<Popper
					placement={placement}
					modifiers={[
						{ name: 'offset', options: { offset: [0, 10] } },
					]}
				>
					{({ ref, style, placement: resolved, arrowProps }) => <div
						ref={ref}
						style={{
							...style as any,
							padding: '0.55rem 0.75rem',
							border: '1px solid currentColor',
							borderRadius: '0.5rem',
							background: 'var(--surface, white)',
						}}
						data-placement={resolved}
					>
						{resolved}
						<div ref={arrowProps.ref} style={arrowProps.style as any} />
					</div>}
				</Popper>
			</Manager>
		</div>
	</div>;
}
