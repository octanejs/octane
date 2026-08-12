import { createRoot, useState } from 'octane';
import { Manager, Popper, Reference } from '@octanejs/popper';

let updatePopper: () => Promise<any> = async () => null;

function App() {
	const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
	const [visible, setVisible] = useState(true);
	const [updates, setUpdates] = useState(0);
	const virtualReference = {
		getBoundingClientRect: () => new DOMRect(500, 300, 40, 20),
	};
	return <main>
		<button id="toggle" onClick={() => setPlacement((value) => value === 'top' ? 'bottom' : 'top')}>
			toggle placement
		</button>
		<button id="visible" onClick={() => setVisible((value) => !value)}>toggle visible</button>
		<button
			id="update"
			onClick={async () => {
				await updatePopper();
				setUpdates((value) => value + 1);
			}}
		>update</button>
		<output id="updates">{String(updates)}</output>
		<Manager>
			<Reference>
				{({ ref }) => <button
					id="reference"
					ref={ref}
					style={{
						position: 'absolute',
						left: '300px',
						top: '300px',
						width: '100px',
						height: '40px',
					}}
				>reference</button>}
			</Reference>
			@if (visible) {
				<Popper
					placement={placement}
					modifiers={[
						{ name: 'flip', enabled: false },
						{ name: 'offset', options: { offset: [0, 10] } },
					]}
				>
					{(snapshot) => {
						updatePopper = snapshot.update;
						return <div
							id="popper"
							ref={snapshot.ref}
							style={{ ...snapshot.style as any, width: '80px', height: '30px' }}
							data-placement={snapshot.placement}
						>
							popper
							<div
								id="arrow"
								ref={snapshot.arrowProps.ref}
								style={snapshot.arrowProps.style as any}
							/>
						</div>;
					}}
				</Popper>
			}
		</Manager>
		<Popper
			referenceElement={virtualReference}
			placement="right"
			modifiers={[
				{ name: 'flip', enabled: false },
			]}
		>
			{({ ref, style, placement }) =>
				<div id="virtual" ref={ref} style={style as any} data-placement={placement}>virtual</div>}
		</Popper>
	</main>;
}

createRoot(document.querySelector('#root')!).render(App);
