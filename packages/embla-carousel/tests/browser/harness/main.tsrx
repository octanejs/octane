import useEmblaCarousel from '@octanejs/embla-carousel';
import { createRoot, delegateEvents, useEffect, useState } from 'octane';

delegateEvents(['click']);

function Carousel() @{
	const [viewportRef, api] = useEmblaCarousel({ duration: 0 });
	const [selected, setSelected] = useState(0);

	useEffect(() => {
		if (!api) return;
		const update = () => setSelected(api.selectedScrollSnap());
		api.on('select', update);
		api.on('destroy', () => {
			const destroyed = document.querySelector('[data-carousel-destroyed]');
			if (destroyed) destroyed.textContent = 'true';
		});
		update();
		return () => api.off('select', update);
	}, [api]);

	<main data-carousel-ready={api ? 'true' : 'false'}>
		<div data-carousel-viewport ref={viewportRef}>
			<div data-carousel-container>
				<div data-carousel-slide>One</div>
				<div data-carousel-slide>Two</div>
				<div data-carousel-slide>Three</div>
			</div>
		</div>
		<output data-selected>{selected as string}</output>
		<button aria-label="Next slide" onClick={() => api?.scrollNext()}>Next</button>
		<button aria-label="Unmount carousel" onClick={() => root.unmount()}>Unmount</button>
	</main>
}

const host = document.getElementById('root');
if (!host) throw new Error('Missing #root');
const root = createRoot(host);
root.render(Carousel);
