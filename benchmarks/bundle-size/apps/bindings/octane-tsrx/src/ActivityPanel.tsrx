// Activity section: Motion presence animations, a React Aria switch, and
// Mantine timers.
import { useRef } from 'octane';
import { AnimatePresence, motion } from '@octanejs/motion';
import { useSwitch } from '@octanejs/aria';
import { useToggleState } from '@octanejs/aria/stately';
import { useHover, useInterval, useListState } from '@octanejs/mantine-hooks';

type Event = { id: number; text: string };

function LiveSwitch(props: { onChange: (live: boolean) => void }) @{
	const state = useToggleState({ defaultSelected: true, onChange: props.onChange });
	const ref = useRef<HTMLInputElement | null>(null);
	const { inputProps, labelProps } = useSwitch({ 'aria-label': 'Live updates' }, state, ref);
	<label {...labelProps}>
		<input {...inputProps} ref={ref} />
		{state.isSelected ? 'Live' : 'Paused'}
	</label>
}

export function ActivityPanel() @{
	const [events, handlers] = useListState<Event>([{ id: 1, text: 'Signed in' }]);
	const ticker = useInterval(
		() => handlers.prepend({ id: Date.now(), text: 'Synced settings' }),
		5000,
	);
	const { hovered, ref } = useHover<HTMLElement>();

	<section class="panel" ref={ref} data-hovered={hovered || undefined}>
		<h2>{'Activity'}</h2>
		<LiveSwitch onChange={(live: boolean) => (live ? ticker.start() : ticker.stop())} />
		<button onClick={() => handlers.setState([])}>{'Clear'}</button>
		<ul>
			<AnimatePresence initial={false}>
				@for (const event of events.slice(0, 5); key event.id) {
					<motion.li
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
					>
						{event.text as string}
					</motion.li>
				}
			</AnimatePresence>
		</ul>
	</section>
}
