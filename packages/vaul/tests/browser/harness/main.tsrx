// @ts-nocheck -- browser fixture exercises React-compatible pointer props.
import { createRoot, delegateEvents, useState } from 'octane';
import { Drawer } from '../../../src/index.tsrx';
import '../../../src/style.css';

delegateEvents(['click', 'keydown', 'pointercancel', 'pointerdown', 'pointermove', 'pointerup']);

const fixture = new URLSearchParams(window.location.search).get('fixture');
const startOpen = fixture === 'initial-snap' || fixture === 'with-handle';
const snapPoints =
	fixture === 'initial-snap'
		? [0, '148px', '355px', 1]
		: fixture === 'with-handle'
			? ['148px', '355px']
			: [0.25, 0.75];
const initialSnapPoint =
	fixture === 'initial-snap' || fixture === 'with-handle' ? '148px' : 0.25;

function BrowserDrawer() @{
	const [open, setOpen] = useState(startOpen);
	const [activeSnapPoint, setActiveSnapPoint] = useState<number | string | null>(initialSnapPoint);
	const activeSnapPointIndex = snapPoints.indexOf(activeSnapPoint as never);

	<main>
		<output id="drawer-state">
			{open ? 'open' : 'closed'}
		</output>
		<output id="snap-point">{String(activeSnapPoint)}</output>
		<output id="active-snap-index">{String(activeSnapPointIndex)}</output>
		<Drawer.Root
			open={open}
			onOpenChange={setOpen}
			autoFocus
			snapPoints={snapPoints}
			activeSnapPoint={activeSnapPoint}
			setActiveSnapPoint={setActiveSnapPoint}
		>
			<Drawer.Trigger>Open drawer</Drawer.Trigger>
			<Drawer.Portal>
				<Drawer.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }} />
				<Drawer.Content
					style={{
						position: 'fixed',
						left: 0,
						right: 0,
						bottom: 0,
						height: '800px',
						background: 'white',
					}}
				>
					<Drawer.Handle />
					<Drawer.Title>Browser drawer</Drawer.Title>
					<Drawer.Description>Drag and snap parity fixture.</Drawer.Description>
					<Drawer.Close>Close drawer</Drawer.Close>
				</Drawer.Content>
			</Drawer.Portal>
		</Drawer.Root>
	</main>
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('missing #root');
createRoot(rootElement).render(BrowserDrawer);
