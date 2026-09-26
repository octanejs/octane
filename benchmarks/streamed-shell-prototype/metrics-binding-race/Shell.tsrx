import { query$ } from 'octane/signals';
import { View } from './View.tsrx';

export function Shell(props: { load: () => Promise<string> }) @{
	const session$ = query$(() => 'current-document', props.load);
	<main id="metrics">
		@try {
			const status = session$.get();
			<View status={status} tick="0" onClick={() => {}} />
		} @pending {
			<View status="pending" tick="0" onClick={() => {}} />
		} @catch {
			<View status="error" tick="0" onClick={() => {}} />
		}
	</main>
}
