// Ordinary Octane-only probe: upstream spells setters as
// React.Dispatch<React.SetStateAction<T>>; Octane exports structurally identical
// local Dispatch/SetStateAction aliases. Kept outside required React-parity
// ownership because there is no pristine React accept/reject counterpart.
import { useDebouncedState, useThrottledState } from '@octanejs/tanstack-pacer';
import type { Dispatch, SetStateAction } from '../../src/internal';

type NumberSetter = Dispatch<SetStateAction<number>>;

function acceptsNumberSetter(setter: NumberSetter): void {
	setter(1);
	setter(function (prev: number) {
		return prev + 1;
	});
}

function probeDebouncedSetterAssignability(): void {
	const [, setDebounced] = useDebouncedState(0, { wait: 40 });
	acceptsNumberSetter(setDebounced);
}

function probeThrottledSetterAssignability(): void {
	const [, setThrottled] = useThrottledState(0, { wait: 40 });
	acceptsNumberSetter(setThrottled);
}

void probeDebouncedSetterAssignability;
void probeThrottledSetterAssignability;

// Local aliases must remain structurally assignable to the React spelling when present.
type ReactLikeSetter = (value: number | ((prev: number) => number)) => void;
const localSetter: NumberSetter = function (value) {
	void value;
};
const reactLike: ReactLikeSetter = localSetter;
void reactLike;

// Reject a setter that cannot accept the callback form.
// @ts-expect-error callback updater required by SetStateAction
const badSetter: NumberSetter = function (value: number) {
	void value;
};
void badSetter;
