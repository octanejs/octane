import {
	cloneElement,
	isValidElement,
	useLayoutEffect,
	useRef,
	useState,
	type ElementDescriptor,
} from 'octane';
import { ENTERED, ENTERING, EXITING } from './Transition.tsrx';
import TransitionGroupContext from './TransitionGroupContext.ts';
import type { SwitchTransitionProps, TransitionCallbacks, TransitionStatus } from './types.ts';

export const modes = { out: 'out-in', in: 'in-out' } as const;

function different(a: ElementDescriptor | null, b: ElementDescriptor | null | undefined) {
	if (a === b) return false;
	return !(isValidElement(a) && isValidElement(b) && a.key != null && a.key === b.key);
}

function chain(element: ElementDescriptor, name: keyof TransitionCallbacks, callback: () => void) {
	return (...args: unknown[]) => {
		(element.props[name] as ((...values: unknown[]) => void) | undefined)?.(...args);
		callback();
	};
}

export function SwitchTransition(props: SwitchTransitionProps) @{
	const appeared = useRef(false);
	const status = useRef<TransitionStatus>(ENTERED);
	const current = useRef<ElementDescriptor | null>(
		props.children ? cloneElement(props.children, { in: true }) : null,
	);
	const [, rerender] = useState(0);
	const pending = props.children ?? null;
	const mode = props.mode ?? modes.out;

	useLayoutEffect(() => {
		appeared.current = true;
	}, []);

	if (!pending) {
		current.current = null;
		status.current = ENTERED;
	} else if (status.current === ENTERING && mode === modes.in) {
		// Keep the in-out pair stable until the entering child finishes.
	} else if (current.current && different(current.current, pending)) {
		status.current = EXITING;
	} else {
		current.current = cloneElement(pending, { in: true });
	}

	let output: unknown = current.current;
	if (status.current === EXITING && current.current && pending) {
		if (mode === modes.out) {
			output = cloneElement(current.current, {
				in: false,
				onExited: chain(current.current, 'onExited', () => {
					current.current = null;
					status.current = ENTERING;
					rerender((value) => value + 1);
				}),
			});
		} else {
			output = [
				current.current,
				cloneElement(pending, {
					in: true,
					onEntered: chain(pending, 'onEntered', () => {
						status.current = ENTERING;
						rerender((value) => value + 1);
					}),
				}),
			];
		}
	} else if (status.current === ENTERING && pending) {
		if (mode === modes.out) {
			output = cloneElement(pending, {
				in: true,
				onEntered: chain(pending, 'onEntered', () => {
					current.current = cloneElement(pending, { in: true });
					status.current = ENTERED;
					rerender((value) => value + 1);
				}),
			});
		} else if (current.current) {
			output = [
				cloneElement(current.current, {
					in: false,
					onExited: chain(current.current, 'onExited', () => {
						current.current = cloneElement(pending, { in: true });
						status.current = ENTERED;
						rerender((value) => value + 1);
					}),
				}),
				cloneElement(pending, { in: true }),
			];
		}
	}

	<TransitionGroupContext.Provider
		value={{ isMounting: !appeared.current }}
	>{output}</TransitionGroupContext.Provider>
}

export default SwitchTransition;
