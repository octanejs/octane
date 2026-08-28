// A separate workerd service binding provides real fetch/Response operations
// and a controlled backend latency. No internet or external service is used.
export default {
	async fetch(request) {
		const url = new URL(request.url);
		await new Promise((resolve) => setTimeout(resolve, Number(url.searchParams.get('delay'))));
		return new Response(`${url.searchParams.get('tenant')}:${url.searchParams.get('resource')}`);
	},
};
