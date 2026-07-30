import {
	useBoolean,
	useCounter,
	useDebounceCallback,
	useDebounceValue,
	useInterval,
	useIsMounted,
	useMap,
	useStep,
	useTimeout,
	useToggle,
	useUnmount,
} from '@octanejs/usehooks-ts';
import { useLayoutEffect } from 'octane';

export function StateProbe() @{
	const first = useBoolean();
	const second = useBoolean(true);
	const counter = useCounter(2);
	const [toggle, flip] = useToggle();
	const [map, actions] = useMap([['a', 1]]);
	const [step, stepActions] = useStep(2);
	<div>
		<span id="state">{`${first.value}/${second.value}/${counter.count}/${toggle}/${
			map.get('a') ?? '-'
		}/${step}`}</span>
		<button id="first" onClick={first.toggle}>first</button>
		<button id="second" onClick={second.toggle}>second</button>
		<button id="increment" onClick={counter.increment}>increment</button>
		<button id="reset" onClick={counter.reset}>reset</button>
		<button id="toggle" onClick={flip}>toggle</button>
		<button id="map" onClick={() => actions.set('a', 2)}>map</button>
		<button id="map-all" onClick={() => actions.setAll([['b', 3]])}>map all</button>
		<button id="remove" onClick={() => actions.remove('a')}>remove</button>
		<button id="next" onClick={stepActions.goToNextStep}>next</button>
		<button id="prev" onClick={stepActions.goToPrevStep}>prev</button>
		<button id="set-updater" onClick={() => stepActions.setStep((value) => value + 1)}>
			set updater
		</button>
	</div>
}

export function StepValidationProbe(props: {
	onReady(actions: {
		goToNextStep(): void;
		goToPrevStep(): void;
		setStep(value: number | ((previous: number) => number)): void;
	}): void;
}) @{
	const [step, actions] = useStep(2);
	useLayoutEffect(() => props.onReady(actions), [actions, props.onReady]);
	<p>{step as string}</p>
}

export function TimingProbe(props: {
	onDebounce(): void;
	onInterval(): void;
	onTimeout(): void;
	onUnmount(): void;
}) @{
	const debounced = useDebounceCallback(props.onDebounce, 50);
	useInterval(props.onInterval, 20);
	useTimeout(props.onTimeout, 30);
	useUnmount(props.onUnmount);
	const mounted = useIsMounted();
	<button id="debounce" data-mounted={mounted() ? 'yes' : 'no'} onClick={debounced}>
		debounce
	</button>
}

export function DebounceControlsProbe(props: {
	onDebounce(value: string): void;
	onPending(value: boolean): void;
	options?: { leading?: boolean; trailing?: boolean };
}) @{
	const debounced = useDebounceCallback(props.onDebounce, 50, props.options);
	<div>
		<button id="queue" onClick={() => debounced('queued')}>queue</button>
		<button id="cancel" onClick={debounced.cancel}>cancel</button>
		<button id="flush" onClick={debounced.flush}>flush</button>
		<button id="pending" onClick={() => props.onPending(debounced.isPending())}>pending</button>
	</div>
}

export function DebounceValueProbe(props: {
	value: number;
	equalityFn?: (left: number, right: number) => boolean;
	onPending(value: boolean): void;
}) @{
	const [value, update] = useDebounceValue(props.value, 50, {
		equalityFn: props.equalityFn,
	});
	<div>
		<span id="value">
			{Object.is(value, -0) ? '-0' : String(value)}
		</span>
		<button id="pending" onClick={() => props.onPending(update.isPending())}>pending</button>
	</div>
}

export function MissingDebounceDelayProbe() @{
	(useDebounceValue as unknown as (value: number) => unknown)(1);
	<p>unreachable</p>
}

export function DisabledTimersProbe(props: {
	onInterval(): void;
	onNullTimeout(): void;
	onZeroTimeout(): void;
}) @{
	useInterval(props.onInterval, null);
	useTimeout(props.onNullTimeout, null);
	useTimeout(props.onZeroTimeout, 0);
	<p>timers</p>
}

export function IsMountedProbe(props: { onReady(probe: () => boolean): void }) @{
	const mounted = useIsMounted();
	useLayoutEffect(() => props.onReady(mounted), [mounted, props.onReady]);
	<p data-mounted-during-render={mounted() ? 'yes' : 'no'}>mounted</p>
}

export function SsrProbe() @{
	const mounted = useIsMounted();
	useInterval(() => {}, null);
	useTimeout(() => {}, null);
	<p>
		{mounted() ? 'mounted' : 'server'}
	</p>
}
