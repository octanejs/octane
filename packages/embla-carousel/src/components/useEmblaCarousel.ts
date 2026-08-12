import { useCallback, useEffect, useRef, useState } from 'octane';
import { areOptionsEqual, arePluginsEqual, canUseDOM } from 'embla-carousel-reactive-utils';
import EmblaCarousel, {
	type EmblaCarouselType,
	type EmblaOptionsType,
	type EmblaPluginType,
} from 'embla-carousel';

export type EmblaViewportRefType = <ViewportElement extends HTMLElement>(
	instance: ViewportElement | null,
) => void;

export type UseEmblaCarouselType = [EmblaViewportRefType, EmblaCarouselType | undefined];

function useEmblaCarousel(
	options?: EmblaOptionsType,
	plugins?: EmblaPluginType[],
): UseEmblaCarouselType;
function useEmblaCarousel(
	...args: [options?: EmblaOptionsType, plugins?: EmblaPluginType[], slot?: symbol]
): UseEmblaCarouselType {
	const hasCompilerSlot = typeof args.at(-1) === 'symbol';
	const options = (hasCompilerSlot && args.length === 1 ? undefined : args[0]) ?? {};
	const plugins = (hasCompilerSlot && args.length === 2 ? undefined : args[1]) ?? [];
	const storedOptions = useRef(options);
	const storedPlugins = useRef(plugins);
	const [emblaApi, setEmblaApi] = useState<EmblaCarouselType>();
	const [viewport, setViewport] = useState<HTMLElement>();

	const reInit = useCallback(() => {
		if (emblaApi) emblaApi.reInit(storedOptions.current, storedPlugins.current);
	}, [emblaApi]);

	useEffect(() => {
		if (areOptionsEqual(storedOptions.current, options)) return;
		storedOptions.current = options;
		reInit();
	}, [options, reInit]);

	useEffect(() => {
		if (arePluginsEqual(storedPlugins.current, plugins)) return;
		storedPlugins.current = plugins;
		reInit();
	}, [plugins, reInit]);

	useEffect(() => {
		if (canUseDOM() && viewport) {
			EmblaCarousel.globalOptions = useEmblaCarousel.globalOptions;
			const newEmblaApi = EmblaCarousel(viewport, storedOptions.current, storedPlugins.current);
			setEmblaApi(newEmblaApi);
			return () => newEmblaApi.destroy();
		}

		setEmblaApi(undefined);
	}, [viewport, setEmblaApi]);

	return [setViewport as EmblaViewportRefType, emblaApi];
}

declare namespace useEmblaCarousel {
	let globalOptions: EmblaOptionsType | undefined;
}

useEmblaCarousel.globalOptions = undefined;

export default useEmblaCarousel;
