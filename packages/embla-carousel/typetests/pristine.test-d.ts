import type { EmblaCarouselType, EmblaOptionsType } from 'embla-carousel';
import useEmblaCarousel, {
	type EmblaViewportRefType,
	type UseEmblaCarouselType,
} from 'embla-carousel-react';

// @type-parity positive:tuple
const result: UseEmblaCarouselType = useEmblaCarousel({ loop: true });
const viewportRef: EmblaViewportRefType = result[0];
const api: EmblaCarouselType | undefined = result[1];

void viewportRef;
void api;

// @type-parity positive:global-options
const options: EmblaOptionsType | undefined = useEmblaCarousel.globalOptions;
useEmblaCarousel.globalOptions = options;

// @type-parity negative:unknown-option
// @ts-expect-error The pinned React hook does not accept an arbitrary option.
useEmblaCarousel({ imaginaryOption: true });
