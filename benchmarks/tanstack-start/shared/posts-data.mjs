// The single deterministic data source both flavors' server functions read.
// No network, ever: identical inputs are a precondition for both the
// correctness comparison and fair perf numbers. `BENCH_DATA_DELAY_MS`
// simulates a data-source latency floor (0 by default so throughput numbers
// measure the frameworks, not the sleep).

const DELAY_MS = Number(process.env.BENCH_DATA_DELAY_MS || 0);

export const POSTS = Array.from({ length: 10 }, (_, index) => ({
	id: String(index + 1),
	title: `Post ${index + 1}: deterministic title ${String.fromCharCode(65 + index)}`,
	body:
		`Body of post ${index + 1}. ` +
		'The same fixture feeds the React flavor and the Octane flavor, so any ' +
		'difference in the rendered result is the framework, not the data.',
}));

const delay = () => (DELAY_MS > 0 ? new Promise((r) => setTimeout(r, DELAY_MS)) : undefined);

export async function listPosts() {
	await delay();
	return POSTS;
}

export async function getPost(id) {
	await delay();
	return POSTS.find((post) => post.id === id) ?? null;
}
