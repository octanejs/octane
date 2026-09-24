import { Hydrate } from 'octane';
import { load } from 'octane/hydration';
import { IndependentReader } from './initial-document-signals.tsrx';

export function Independent() @{
	<aside>
		<Hydrate independent when={load()}>
			<IndependentReader />
		</Hydrate>
	</aside>
}
