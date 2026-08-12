import { Portal, useMachine } from '@octanejs/zag';
import { machine } from './machine.tsrx';

export function ServerFixture() @{
	const service = useMachine(machine);

	<Portal>
		<p id="server-machine">{service.state.get() + '/' + service.context.get('count')}</p>
	</Portal>
}
