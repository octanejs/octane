// Renders the navigation engine + the FIRST match. The match chain advances from
// here: each match's route component renders an `<Outlet/>` which looks up the next
// match. Subscribes to `router.stores.firstId` so a navigation that changes the
// root match re-renders.
import { useLayoutEffect } from 'octane';
import { setupScrollRestoration } from '@tanstack/router-core';
import { useStore } from './useStore.ts';
import { useRouter } from './context.ts';
import { Transitioner } from './Transitioner.tsrx';
import { Match } from './Match.tsrx';

export function Matches() @{
	const router = useRouter();
	const firstId = useStore(router.stores.firstId, (id) => id);

	// `createRouter({ scrollRestoration: true })` wires scroll save/restore here, so
	// it works without the (deprecated) <ScrollRestoration/> component.
	useLayoutEffect(() => {
		if (router.options.scrollRestoration) setupScrollRestoration(router);
	}, [router]);

	<>
		<Transitioner />
		@if (firstId) {
			<Match matchId={firstId} />
		}
	</>
}
