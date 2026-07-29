import {
	useClickOutside,
	useDrag,
	useHotkeys,
	useHover,
	useLongPress,
	type UseDragState,
} from '@octanejs/mantine-hooks';

export function HoverHarness() @{
	const { ref, hovered } = useHover<HTMLButtonElement>();
	<button id="hover" ref={ref}>
		{hovered ? 'hovered' : 'idle'}
	</button>
}

export function HoverReplacementHarness({ replacement }: { replacement: boolean }) @{
	const { ref, hovered } = useHover<HTMLElement>();
	<section>
		{replacement
			? <div id="hover-replacement" ref={ref}>
					{hovered ? 'hovered' : 'idle'}
				</div>
			: <button id="hover-replacement" ref={ref}>
					{hovered ? 'hovered' : 'idle'}
				</button>}
	</section>
}

export function LongPressHarness({
	onLongPress,
}: {
	onLongPress: (event: React.MouseEvent | React.TouchEvent) => void;
}) @{
	const handlers = useLongPress(onLongPress, { threshold: 10 });
	<button id="long-press" {...handlers}>press</button>
}

export function DragHarness({ onDrag }: { onDrag: (state: UseDragState) => void }) @{
	const { ref } = useDrag<HTMLButtonElement>(onDrag);
	<button id="drag" ref={ref}>drag</button>
}

export function OmittedInteractionOptionsHarness({ onOutside, onHotkey }) @{
	const ref = useClickOutside<HTMLButtonElement>(onOutside);
	useHotkeys([['K', onHotkey]]);
	<button id="optional-interaction" ref={ref}>inside</button>
}
