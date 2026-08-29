// Entirely invented data and schedules. This local service has no network
// dependency, credentials, production schema or captured application payloads.
const gates = new Map();
const counts = { navigation: 48, tiles: 18, related: 6 };
const delays = { profile: 1, preferences: 1, catalog: 1, summary: 4, related: 4 };

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const q = url.searchParams;
		const id = q.get('id');
		if (url.pathname === '/release' || url.pathname === '/reset') {
			let state = gates.get(id);
			// The consumer can receive the shell before the first backend fetch
			// registers its gate. Remember release for subsequent requests too.
			if (!state && url.pathname === '/release') gates.set(id, (state = { released: true }));
			if (state) state.released = true;
			if (url.pathname === '/reset') gates.delete(id);
			return new Response('ok');
		}
		const resource = q.get('resource');
		const gate = q.get('gate');
		const tail = resource === 'summary' || resource === 'related' || resource.startsWith('author:');
		if (gate === 'shell' || (gate === 'tail' && tail)) {
			let state = gates.get(id);
			if (!state) gates.set(id, (state = { released: false }));
			// Request-local timer promises keep the fetch alive. Sharing resolvers
			// across Workers requests can cancel the originating request instead.
			// Gates run only in untimed preflights, never the measured samples.
			const deadline = Date.now() + 4000;
			while (!state.released) {
				if (Date.now() > deadline) return new Response('Gate was not released', { status: 504 });
				await new Promise((resolve) => setTimeout(resolve, 1));
			}
		}
		const factor = resource.startsWith('author:')
			? Number(resource.slice(7)) + 1
			: (delays[resource] ?? 1);
		const delay = Number(q.get('delay')) * factor;
		if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
		const count =
			(resource.startsWith('history:') ? 40 : (counts[resource] ?? 0)) * Number(q.get('scale'));
		const tenant = q.get('tenant');
		return Response.json({
			label: `${tenant}/${resource}`,
			next: `${tenant}-detail`,
			items: Array.from({ length: count }, (_, id) => ({
				id,
				title: `${tenant}/${resource}/item-${id}`,
				text: `Synthetic entry ${id}: <tag> & "quoted" text.`,
				code: `const value = ${id}; // </script> & example`,
				tags: [`group-${id % 4}`, `state-${id % 3}`],
				author: id % 4,
			})),
		});
	},
};
