import useEmblaCarousel from '@octanejs/embla-carousel';
import type { EmblaCarouselType, EmblaOptionsType, EmblaPluginType } from 'embla-carousel';
import { useEffect } from 'octane';

export function CarouselHarness({
	options,
	plugins,
	onApi,
	attached = true,
	replacement = false,
}: {
	options: EmblaOptionsType;
	plugins: EmblaPluginType[];
	onApi: (api: EmblaCarouselType | undefined) => void;
	attached?: boolean;
	replacement?: boolean;
}) @{
	const [viewportRef, api] = useEmblaCarousel(options, plugins);

	useEffect(() => onApi(api), [api, onApi]);

	<section data-api={api ? 'ready' : 'pending'}>
		@if (attached) {
			@if (replacement) {
				<article data-viewport="replacement" ref={viewportRef}>
					<div>
						<div>One</div>
						<div>Two</div>
					</div>
				</article>
			} @else {
				<div data-viewport="initial" ref={viewportRef}>
					<div>
						<div>One</div>
						<div>Two</div>
					</div>
				</div>
			}
		}
	</section>
}

export function ServerCarousel() @{
	const [, api] = useEmblaCarousel();
	<div data-api={api ? 'ready' : 'pending'}>server</div>
}

export function ServerHydrationCarousel({
	attached = true,
	replacement = false,
}: {
	attached?: boolean;
	replacement?: boolean;
}) @{
	<section data-api="pending">
		@if (attached) {
			@if (replacement) {
				<article data-viewport="replacement">
					<div>
						<div>One</div>
						<div>Two</div>
					</div>
				</article>
			} @else {
				<div data-viewport="initial">
					<div>
						<div>One</div>
						<div>Two</div>
					</div>
				</div>
			}
		}
	</section>
}
