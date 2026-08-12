// Frozen in U1 as the adoption corpus. It becomes executable after runtime parity.
import useSWR, { SWRConfig, mutate, preload, useSWRConfig } from '@octanejs/swr';
import useSWRImmutable from '@octanejs/swr/immutable';
import useSWRInfinite from '@octanejs/swr/infinite';
import useSWRMutation from '@octanejs/swr/mutation';
import useSWRSubscription from '@octanejs/swr/subscription';

const fetchJSON = (url: string) => fetch(url).then((response) => response.json());

export function AdoptionConsumer() @{
	const user = useSWR('/api/user', fetchJSON);
	const immutable = useSWRImmutable('/api/version', fetchJSON);
	const pages = useSWRInfinite((index) => `/api/items?page=${index}`, fetchJSON);
	const update = useSWRMutation('/api/user', fetchJSON);
	const events = useSWRSubscription('events', (_key, { next }) => {
		next(undefined, 'connected');
		return () => undefined;
	});
	const config = useSWRConfig();

	preload('/api/user', fetchJSON);
	void mutate('/api/user');

	<SWRConfig value={config}>
		<output>{JSON.stringify({ user, immutable, pages, update, events })}</output>
	</SWRConfig>
}
