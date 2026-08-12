import type { EmblaOptionsType, EmblaPluginType } from 'embla-carousel';

export type Observation = {
	constructs: number;
	destroys: number;
	reinitializations: Array<[EmblaOptionsType, EmblaPluginType[]]>;
	pluginsAtConstruct: EmblaPluginType[][];
	globalOptionsAtConstruct: Array<EmblaOptionsType | undefined>;
};

let current: Observation | undefined;

const EmblaCarousel = Object.assign(
	function EmblaCarousel(
		_viewport: HTMLElement,
		_options: EmblaOptionsType,
		plugins: EmblaPluginType[],
	) {
		if (!current) throw new Error('beginObservation() must run before carousel construction');
		const observation = current;
		observation.constructs += 1;
		observation.pluginsAtConstruct.push(plugins);
		observation.globalOptionsAtConstruct.push(EmblaCarousel.globalOptions);
		return {
			destroy: function destroy() {
				observation.destroys += 1;
			},
			reInit: function reInit(options: EmblaOptionsType, nextPlugins: EmblaPluginType[]) {
				observation.reinitializations.push([options, nextPlugins]);
			},
		};
	},
	{ globalOptions: undefined as EmblaOptionsType | undefined },
);

export function beginObservation(): Observation {
	EmblaCarousel.globalOptions = undefined;
	current = {
		constructs: 0,
		destroys: 0,
		reinitializations: [],
		pluginsAtConstruct: [],
		globalOptionsAtConstruct: [],
	};
	return current;
}

export default EmblaCarousel;
