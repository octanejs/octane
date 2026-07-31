// OCTANE ADAPTATION: octane's renderable type is `OctaneNode = unknown`, and a
// union containing `unknown` collapses to `unknown`, so RAC's children render
// prop carries no inferable render values here. Annotating them restores the
// upstream parameter types without weakening the binding.
import {
	SliderFill,
	Slider as SliderPrimitive,
	SliderThumb,
	SliderTrack,
	type SliderProps as SliderPrimitiveProps,
	type SliderRenderProps,
} from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';

type SliderValue = number | number[];
type SliderProps<T extends SliderValue = SliderValue> =
	Omit<SliderPrimitiveProps<T>, 'className'> & {
		className?: string;
	};

export function Slider<T extends SliderValue = SliderValue>({ className, ...props }: SliderProps<
	T
>) {
	return <SliderPrimitive
		className={cn(
			'group relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col',
			className,
		)}
		data-slot="slider"
		{...props}
	>
		{({ state }: SliderRenderProps) => {
			return <>
				<SliderTrack
					data-slot="slider-track"
					className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
				>
					<SliderFill
						data-slot="slider-range"
						className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
					/>
				</SliderTrack>
				{state.values.map(
					(_: number, index: number) =>
						<SliderThumb
							data-slot="slider-thumb"
							key={index}
							index={index}
							className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none group-data-horizontal:top-[50%] group-data-vertical:left-[50%] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
						/>,
				)}
			</>;
		}}
	</SliderPrimitive>;
}
