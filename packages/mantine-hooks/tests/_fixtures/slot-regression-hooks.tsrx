import {
	useClipboard,
	useDisclosure,
	useHash,
	useMediaQuery,
	useMouse,
	useMove,
	useTimeout,
	useToggle,
	type UseMovePosition,
} from '@octanejs/mantine-hooks';

export function MoveDefaultDirectionHarness({
	onChange,
}: {
	onChange: (position: UseMovePosition) => void;
}) @{
	const { ref } = useMove(onChange, undefined);
	<div id="move-target" ref={ref} />
}

export function MediaQueryOmittedOptionsHarness() @{
	const matches = useMediaQuery('(min-width: 60rem)', false);
	<output id="media-result">
		{matches ? 'wide' : 'narrow'}
	</output>
}

export function MouseLifecycleHarness({ attached }: { attached: boolean }) @{
	const { ref, x, y } = useMouse<HTMLDivElement>();

	<section>
		<output id="mouse-position">{`${x},${y}`}</output>
		@if (attached) {
			<div id="mouse-target" ref={ref} />
		}
	</section>
}

export function OmittedOptionsHarness({ onTimeout }: { onTimeout: () => void }) @{
	const clipboard = useClipboard();
	const [opened, disclosure] = useDisclosure();
	const [hash] = useHash();
	const timeout = useTimeout(onTimeout, 10);
	const [toggleValue, toggle] = useToggle();

	<section>
		<output id="clipboard-default">
			{clipboard.copied ? 'copied' : 'idle'}
		</output>
		<output id="disclosure-default">
			{opened ? 'open' : 'closed'}
		</output>
		<output id="hash-default">{hash || 'empty'}</output>
		<output id="toggle-default">
			{toggleValue ? 'on' : 'off'}
		</output>
		<button id="open-disclosure" onClick={disclosure.open}>open</button>
		<button id="toggle-default-value" onClick={() => toggle()}>toggle</button>
		<button id="start-timeout" onClick={() => timeout.start()}>start timeout</button>
	</section>
}
