import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const fixtures = JSON.parse(
	readFileSync(new URL('./fixtures/hacker-news.json', import.meta.url), 'utf8'),
);
const port = Number(process.env.PORT || 5190);

const endpointToFeed = {
	topstories: 'top',
	newstories: 'new',
	askstories: 'ask',
	showstories: 'show',
	jobstories: 'jobs',
};

function generatedStory(id) {
	return {
		id,
		type: 'story',
		by: `user${id}`,
		time: 1700000000 + id,
		title: `Story #${id}`,
		url: `https://example.com/${id}`,
		score: id,
		descendants: 0,
		kids: [],
	};
}

function sendJson(res, value, status = 200) {
	res.statusCode = status;
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(value));
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

	if (req.method === 'OPTIONS') {
		res.statusCode = 204;
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.end();
		return;
	}

	if (url.pathname === '/health') {
		sendJson(res, { ok: true });
		return;
	}

	const feedMatch = url.pathname.match(/^\/v0\/([^/]+)\.json$/);
	const feed = feedMatch ? endpointToFeed[feedMatch[1]] : undefined;
	if (feed) {
		await delay(80);
		sendJson(res, fixtures.feeds[feed]);
		return;
	}

	const itemMatch = url.pathname.match(/^\/v0\/item\/(\d+)\.json$/);
	if (itemMatch) {
		await delay(20);
		const id = Number(itemMatch[1]);
		sendJson(res, fixtures.items[String(id)] ?? generatedStory(id));
		return;
	}

	const userMatch = url.pathname.match(/^\/v0\/user\/([^/]+)\.json$/);
	if (userMatch) {
		await delay(20);
		sendJson(res, fixtures.users[decodeURIComponent(userMatch[1])] ?? null);
		return;
	}

	sendJson(res, { error: 'Not found' }, 404);
});

server.listen(port, '127.0.0.1', () => {
	console.log(`Hacker News fixture API: http://127.0.0.1:${port}/v0`);
});
