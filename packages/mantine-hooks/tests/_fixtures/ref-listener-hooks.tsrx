import { useEventListener, useFocusWithin } from '@octanejs/mantine-hooks';

export function RefListenerHarness({
	replacement,
	onClick,
}: {
	replacement: boolean;
	onClick: () => void;
}) @{
	const eventRef = useEventListener<'click', HTMLElement>('click', onClick);
	const { ref: focusRef } = useFocusWithin<HTMLElement>();

	<section>
		{replacement
			? <div id="event-node" ref={eventRef} />
			: <button id="event-node" ref={eventRef} />}
		{replacement
			? <div id="focus-node" ref={focusRef} />
			: <button id="focus-node" ref={focusRef} />}
	</section>
}
