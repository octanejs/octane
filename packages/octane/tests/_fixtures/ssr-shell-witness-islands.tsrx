import { Hydrate } from 'octane';
import { interaction } from 'octane/hydration';
import {
	Action,
	Controlled,
	Descriptor,
	Effects,
	Handle,
	Handler,
	Ref,
	SignalAlias,
	SignalAttribute,
	SignalText,
	Snapshot,
	Store,
	choose,
} from './ssr-shell-witness.tsrx';

// Every construct of ssr-shell-witness.tsrx, inside independent islands that
// activate on their own, and one handler of the shell's own after them.
export function Islands() @{
	<main>
		<h1>{'Shell'}</h1>
		<Hydrate independent when={interaction()}>
			<Handler />
			<Ref />
			<Effects />
			<Snapshot />
			<Handle />
			<Store />
			<Controlled query="q" agreed />
			<SignalText />
			<SignalAttribute />
			<SignalAlias />
			<Action />
			<Descriptor />
			<Hydrate independent when={interaction()}>
				<button type="button" onClick={choose}>{'Nested'}</button>
			</Hydrate>
		</Hydrate>
		<footer>
			<button type="button" onDoubleClick={choose}>{'After'}</button>
		</footer>
	</main>
}

// An ordinary boundary hydrates with its parent, so it is part of the shell.
export function OrdinaryHydrate() @{
	<main>
		<Hydrate when={interaction()}>
			<Handler />
		</Hydrate>
	</main>
}
