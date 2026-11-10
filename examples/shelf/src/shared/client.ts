/** What every page's entry needs: the first session, adopting the server render's data if there is one. */
import { namespaceFrom, openSession, type Session } from './session.ts';

export function startSession(): { session: Session; hydrate: boolean } {
	const seed = document.getElementById('shelf-seed')?.textContent ?? null;
	return {
		session: openSession('ada', namespaceFrom(location.search), seed),
		hydrate: seed !== null,
	};
}
