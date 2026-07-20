import { useState } from 'octane';
import { Await, createFileRoute } from '@octanejs/tanstack-router';
import { createServerFn } from '@octanejs/tanstack-start';

const DEFER_MS = Number(process.env.BENCH_DEFER_MS || 200);

const personServerFn = createServerFn({ method: 'GET' }).validator(
	(data: { name: string }) => data,
).handler(({ data }: { data: { name: string } }) => {
	return { name: data.name, randomNumber: 4 };
});

const slowServerFn = createServerFn({ method: 'GET' }).validator(
	(data: { name: string }) => data,
).handler(async ({ data }: { data: { name: string } }) => {
	await new Promise((r) => setTimeout(r, DEFER_MS));
	return { name: data.name, randomNumber: 17 };
});

export const Route = createFileRoute('/deferred')({
	loader: async () => {
		return {
			deferredStuff: new Promise<string>((r) => setTimeout(
				() => r('Hello deferred!'),
				DEFER_MS * 2,
			)),
			deferredPerson: slowServerFn({ data: { name: 'Tanner Linsley' } }),
			person: await personServerFn({ data: { name: 'John Doe' } }),
		};
	},
	component: Deferred,
});

function Deferred() @{
	const [count, setCount] = useState(0);
	const data = Route.useLoaderData();

	<div class="p-2">
		<div data-testid="regular-person">
			{data.person.name + ' - ' + data.person.randomNumber}
		</div>
		<Await promise={data.deferredPerson} fallback={<div>Loading person...</div>}>
			{(person) => <div data-testid="deferred-person">
				{person.name + ' - ' + person.randomNumber}
			</div>}
		</Await>
		<Await promise={data.deferredStuff} fallback={<div>Loading stuff...</div>}>
			{(stuff) => <h3 data-testid="deferred-stuff">{stuff}</h3>}
		</Await>
		<div data-testid="deferred-count">
			{'Count: ' + count}
		</div>
		<div>
			<button data-testid="deferred-increment" onClick={() => setCount(count + 1)}>
				Increment
			</button>
		</div>
	</div>
}
