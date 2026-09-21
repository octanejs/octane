import { autoUpdate, offset, size, useFloating } from '@octanejs/floating-ui';
import { createRoot, useEffect, useRef, useState } from 'octane';

const resizeErrors: string[] = [];
window.addEventListener('error', (event) => {
	if (/ResizeObserver loop/.test(event.message)) resizeErrors.push(event.message);
});
Object.assign(window, { resizeErrors });

function ResizeFeedback() @{
	const [width, setWidth] = useState(100);
	const [measured, setMeasured] = useState(0);
	const [, setEnabled, getEnabled] = useState(false);
	const reference = useRef<HTMLDivElement | null>(null);
	const floating = useRef<HTMLDivElement | null>(null);
	useEffect(
		() => autoUpdate(reference.current!, floating.current!, () => {
			const next = reference.current!.getBoundingClientRect().width;
			setMeasured(next);
			if (getEnabled() && next < 200) setWidth(Math.min(200, next + 20));
		}, {
			ancestorScroll: false,
			ancestorResize: false,
			layoutShift: false,
		}),
		[],
	);
	<section>
		<button
			id="resize-start"
			onClick={() => {
				setEnabled(true);
				setWidth(140);
			}}
		>resize</button>
		<div id="resize-parent" style={{ width: `${width}px` }}>
			<div id="resize-reference" ref={reference} style={{ width: '100%', height: '20px' }} />
		</div>
		<div ref={floating} style={{ width: '40px', height: '20px' }} />
		<output id="resize-measured">{String(measured)}</output>
	</section>
}

function ResizeMiddleware() @{
	const [width, setWidth] = useState(100);
	const floating = useFloating({
		middleware: [
			size({
				apply({ rects, elements }) {
					elements.floating.style.width = `${rects.reference.width}px`;
				},
			}),
		],
		whileElementsMounted: (reference, element, update) => autoUpdate(reference, element, update, {
			ancestorScroll: false,
			ancestorResize: false,
			layoutShift: false,
		}),
	});
	<section>
		<button id="middleware-resize" onClick={() => setWidth(180)}>resize middleware</button>
		<div
			id="middleware-reference"
			ref={floating.refs.setReference}
			style={{ width: `${width}px`, height: '20px' }}
		/>
		<div
			id="middleware-floating"
			ref={floating.refs.setFloating}
			style={{ ...floating.floatingStyles, height: '20px' }}
		/>
	</section>
}

function App() @{
	const floating = useFloating({
		placement: 'bottom-start',
		middleware: [offset(12)],
		whileElementsMounted: autoUpdate,
	});
	<div>
		<button
			id="reference"
			ref={floating.refs.setReference}
			style={{ position: 'absolute', left: '40px', top: '30px', width: '100px', height: '20px' }}
		>reference</button>
		<div
			id="floating"
			ref={floating.refs.setFloating}
			style={{ ...floating.floatingStyles, width: '60px', height: '30px' }}
			data-positioned={floating.isPositioned ? 'yes' : 'no'}
		>floating</div>
		<ResizeFeedback />
		<ResizeMiddleware />
	</div>
}

createRoot(document.getElementById('app')!).render(<App />);
