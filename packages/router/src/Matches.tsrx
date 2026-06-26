// Renders the navigation engine + the FIRST match. The match chain advances from
// here: each match's route component renders an `<Outlet/>` which looks up the next
// match. Subscribes to `router.stores.firstId` so a navigation that changes the
// root match re-renders.
import { useStore } from './useStore.ts';
import { useRouter } from './context.ts';
import { Transitioner } from './Transitioner.tsrx';
import { Match } from './Match.tsrx';

export function Matches() @{
	const router = useRouter();
	const firstId = useStore(router.stores.firstId, (id) => id);

	<>
		<Transitioner />
		@if (firstId) {
			<Match matchId={firstId} />
		}
	</>
}
