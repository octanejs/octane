import { useState } from 'octane';
import {
	DbClient,
	DbProvider,
	HydrationBoundary,
	collectionOptions,
	useDbClient,
	useLiveQuery,
} from '@octanejs/tanstack-db';

type Person = { id: string; name: string };
const people = collectionOptions(
	'binding-people',
	() => ({
		id: 'binding-people',
		getKey: (person: Person) => person.id,
		sync: { sync: ({ markReady }) => markReady() },
	}),
);

function People() @{
	const client = useDbClient();
	const result = useLiveQuery((q) => q.from({ people: client.collection(people) }));
	<output id="people">
		{result.data?.map((person) => person.name).join(', ') ?? 'loading' as string}
	</output>
}

export function Database() @{
	const [client, setClient] = useState(() => new DbClient());
	const [name, setName] = useState('Ada');
	const state = {
		collections: [
			{
				collectionId: people.id,
				rows: [
					{ key: '1', value: { id: '1', name } },
				],
			},
		],
	};
	<section>
		<button id="rename" onClick={() => setName(name === 'Ada' ? 'Grace' : 'Ada')}>Rename</button>
		<button id="replace" onClick={() => setClient(new DbClient())}>Replace client</button>
		<DbProvider client={client}>
			<HydrationBoundary state={state}>
				<People />
			</HydrationBoundary>
		</DbProvider>
	</section>
}
