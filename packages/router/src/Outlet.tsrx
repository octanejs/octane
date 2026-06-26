// Renders the child match below the current one. Reads the current match id from
// `matchContext`, finds the NEXT id in the match-id chain, and renders its `<Match/>`
// — the pull-based descent that replaces a top-down state diff. Renders nothing at
// a leaf.
import { useContext } from 'octane';
import { useStore } from './useStore.ts';
import { useRouter, matchContext } from './context.ts';
import { Match } from './Match.tsrx';

export function Outlet() @{
	const router = useRouter();
	const parentId = useContext(matchContext);
	const childId = useStore(router.stores.matchesId, (ids) => {
		const i = ids.indexOf(parentId);
		return i >= 0 ? ids[i + 1] : undefined;
	});

	@if (childId) {
		<Match matchId={childId} />
	}
}
