import { Transition, TransitionGroup } from '../../src/index.ts';

export function ServerTransition() @{
	<Transition in timeout={20}>
		{(status) => <span id="server-state">{status}</span>}
	</Transition>
}

export function ServerGroup() @{
	const child = <Transition key="server" timeout={20}>
		<span id="server-child">{'child'}</span>
	</Transition>;
	<TransitionGroup component="section" id="server-group" children={[child]} />
}
