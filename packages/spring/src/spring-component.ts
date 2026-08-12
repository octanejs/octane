import { Spring as SpringImpl } from './components.tsrx';
import type { Scope } from 'octane';
import type { SpringValues } from './types/objects';
import type {
	ControllerUpdate,
	NoInfer,
	SpringChain,
	SpringToFn,
	UnknownProps,
} from './types/index';

type SpringComponentProps<State extends object = UnknownProps> = unknown &
	ControllerUpdate<State> & {
		children: (values: SpringValues<State>) => unknown;
	};

// Infer state from "from" object prop.
export function Spring<State extends object>(
	props: {
		from: State;
		to?: SpringChain<NoInfer<State>> | SpringToFn<NoInfer<State>>;
	} & Omit<SpringComponentProps<NoInfer<State>>, 'from' | 'to'>,
): unknown;

// Infer state from "to" object prop.
export function Spring<State extends object>(
	props: { to: State } & Omit<SpringComponentProps<NoInfer<State>>, 'to'>,
): unknown;

export function Spring(props: any, scope?: Scope, extra?: unknown): unknown {
	return (SpringImpl as (props: any, scope?: Scope, extra?: unknown) => unknown)(
		props,
		scope,
		extra,
	);
}
