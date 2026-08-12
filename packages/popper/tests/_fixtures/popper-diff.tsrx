import { useState } from 'octane';
import { Manager, Popper, Reference } from '@octanejs/popper';

export function PopperDiff() {
	const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
	const [visible, setVisible] = useState(true);
	return <section>
		<button id="toggle" onClick={() => setPlacement((value) => value === 'top' ? 'bottom' : 'top')}>
			toggle
		</button>
		<button id="visible" onClick={() => setVisible((value) => !value)}>visible</button>
		<Manager>
			<Reference>
				{({ ref }) => <button id="reference" ref={ref}>reference</button>}
			</Reference>
			@if (visible) {
				<Popper
					placement={placement}
					modifiers={[
						{ name: 'offset', options: { offset: [0, 8] } },
					]}
				>
					{({ ref, style, placement: resolved, arrowProps }) => <div
						id="popper"
						ref={ref}
						style={style as any}
						data-placement={resolved}
					>
						popper
						<div id="arrow" ref={arrowProps.ref} style={arrowProps.style as any} />
					</div>}
				</Popper>
			}
		</Manager>
	</section>;
}
