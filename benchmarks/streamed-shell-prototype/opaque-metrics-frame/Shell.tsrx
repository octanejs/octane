import { Frame } from './Frame.tsrx';
import { Ready } from './Ready.tsrx';
import { session$ } from './State.tsrx';

export function Shell() @{
	<main id="island" data-octane-hydrate-id="fixture" data-octane-hydrate-when="load">
		<Frame
			rows={[
				{ id: 'timer', text: '0' },
			]}
		>
			@try {
				const status = session$.get();
				<Ready status={status} onClick={() => {}} />
			} @pending {
				<p id="pending">Waiting for configuration</p>
			} @catch {
				<p id="error">Configuration failed</p>
			}
		</Frame>
	</main>
}
