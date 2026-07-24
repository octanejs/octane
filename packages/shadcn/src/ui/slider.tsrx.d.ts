export interface SliderProps extends Record<string, unknown> {
	className?: string;
	defaultValue?: number[];
	value?: number[];
	min?: number;
	max?: number;
}

export function Slider(props: SliderProps): any;
