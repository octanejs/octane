// router-data route-trie microbench (Node-only). RFC #3001 Phase 0 exit
// criterion: a trie match under 1 µs per route.
//
// Two matchers resolve the same URL mix over route tables of 50, 200 and
// 1,000 routes:
//   octane-trie   ./trie.js, the RFC's matcher (static > param > optional >
//                 splat at each depth, with backtracking);
//   ranked-regex  every route compiled to a RegExp, sorted by the same rank
//                 and tried in order: the classic data-router matcher.
//
// Gate (fatal): both matchers return the same route and params for every URL,
// and every URL resolves to the route the table expects.
// Op: match_ns_<size>, nanoseconds per match, the median of the iterations.
//
// Usage: node benchmarks/router-data/trie/run.mjs [iterations]   (default 10)
import fs from 'node:fs';
import { summarizeSamples, timingStatForJson } from '../../lib/stats.mjs';
import { createMatcher } from './trie.js';

const ITER = parseInt(process.argv[2] || '10', 10);
const SIZES = [50, 200, 1000];

/** A route table shaped like a real app, padded to `size` with feature sections. */
function table(size) {
	const routes = [
		['home', '/'],
		['about', '/about'],
		['blog', '/blog'],
		['blog-new', '/blog/new'],
		['blog-post', '/blog/$slug'],
		['docs', '/docs/$'],
		['help', '/{-$lang}/help'],
		['help-topic', '/{-$lang}/help/$topic'],
		['org', '/org/$org'],
		['org-settings', '/org/$org/settings'],
		['project', '/org/$org/project/$project'],
		['task', '/org/$org/project/$project/task/$task'],
		['comment', '/org/$org/project/$project/task/$task/comments/$comment'],
		['user', '/users/$id'],
		['user-edit', '/users/$id/edit'],
		['user-me', '/users/me'],
	];
	for (let i = 0; routes.length < size; i++) {
		const base = `/section${i}`;
		routes.push(
			[`s${i}`, base],
			[`s${i}-item`, `${base}/items/$id`],
			[`s${i}-view`, `${base}/items/$id/view`],
			[`s${i}-files`, `${base}/files/$`],
		);
	}
	return routes.slice(0, size).map(([id, path]) => ({ id, path }));
}

/** URLs with the route and params each must resolve to. */
function urls(size) {
	const last = Math.floor((size - 16) / 4) - 1;
	return [
		['/', 'home', {}],
		['/blog/new', 'blog-new', {}],
		['/blog/hello-world', 'blog-post', { slug: 'hello-world' }],
		['/docs/guide/routing/loaders', 'docs', { _splat: 'guide/routing/loaders' }],
		['/docs', 'docs', { _splat: '' }],
		['/docs/', 'docs', { _splat: '' }],
		['/fr/help', 'help', { lang: 'fr' }],
		['/help', 'help', {}],
		['/help/install', 'help-topic', { topic: 'install' }],
		['/org/acme/settings', 'org-settings', { org: 'acme' }],
		['/org/acme/project/42/task/7', 'task', { org: 'acme', project: '42', task: '7' }],
		[
			'/org/acme/project/42/task/7/comments/9',
			'comment',
			{ org: 'acme', project: '42', task: '7', comment: '9' },
		],
		['/users/me', 'user-me', {}],
		['/users/a%20b/edit', 'user-edit', { id: 'a b' }],
		[`/section${last}/items/5/view`, `s${last}-view`, { id: '5' }],
		[`/section${last}/files/a/b.txt`, `s${last}-files`, { _splat: 'a/b.txt' }],
		['/org/acme/project/42/missing', null, null],
		['/nope/at/all', null, null],
	];
}

const KIND = { static: 3, param: 2, optional: 1, splat: 0 };
const kind = (s) =>
	s === '$'
		? KIND.splat
		: s.startsWith('{-$')
			? KIND.optional
			: s.startsWith('$')
				? KIND.param
				: KIND.static;

/** The ranked-RegExp matcher: one pattern per route, tried best rank first. */
function createRegexMatcher(routes) {
	const compiled = routes.map((route) => {
		const segments = route.path.split('/').filter(Boolean);
		const names = [];
		let source = '^';
		for (const s of segments) {
			const k = kind(s);
			if (k === KIND.splat) {
				names.push('_splat');
				source += '(?:/(.*))?';
			} else if (k === KIND.optional) {
				names.push(s.slice(3, -1));
				source += '(?:/([^/]+))?';
			} else if (k === KIND.param) {
				names.push(s.slice(1));
				source += '/([^/]+)';
			} else source += '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}
		return { id: route.id, names, rank: segments.map(kind), re: new RegExp(source + '/?$') };
	});
	compiled.sort((a, b) => {
		for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
			const d = (b.rank[i] ?? -1) - (a.rank[i] ?? -1);
			if (d) return d;
		}
		return 0;
	});
	return (pathname) => {
		for (const r of compiled) {
			const m = r.re.exec(pathname);
			if (!m) continue;
			const params = {};
			for (let i = 0; i < r.names.length; i++) {
				// An absent optional is left out; an empty splat is ''.
				const v = m[i + 1] ?? (r.names[i] === '_splat' ? '' : undefined);
				if (v !== undefined) params[r.names[i]] = v.indexOf('%') === -1 ? v : decodeURIComponent(v);
			}
			return { id: r.id, params };
		}
		return null;
	};
}

const MATCHERS = [
	{ name: 'octane-trie', create: createMatcher },
	{ name: 'ranked-regex', create: createRegexMatcher },
];

const failures = [];
const samples = Object.fromEntries(MATCHERS.map((m) => [m.name, {}]));
let sink = 0;

for (const size of SIZES) {
	const routes = table(size);
	const cases = urls(size);
	const built = MATCHERS.map((m) => ({ name: m.name, match: m.create(routes) }));
	for (const { name, match } of built) {
		for (const [url, id, params] of cases) {
			const got = match(url);
			const want = id === null ? null : { id, params };
			if (JSON.stringify(got) !== JSON.stringify(want))
				failures.push(
					`${name} ${size}: ${url} → ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
				);
		}
	}
	const paths = cases.map((c) => c[0]);
	const rounds = 20_000;
	for (const { name, match } of built) {
		// Warm up to optimized code before sampling.
		for (let r = 0; r < rounds; r++) for (const p of paths) sink += match(p) ? 1 : 0;
		const ns = [];
		for (let i = 0; i < ITER; i++) {
			const t0 = process.hrtime.bigint();
			for (let r = 0; r < rounds; r++) for (const p of paths) sink += match(p) ? 1 : 0;
			ns.push(Number(process.hrtime.bigint() - t0) / (rounds * paths.length));
		}
		samples[name][`match_ns_${size}`] = ns;
	}
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(
	`\nRoute match, ns per match (median of ${ITER}); URL mix of hits, fallbacks and misses.\n`,
);
console.log('routes | ' + MATCHERS.map((m) => m.name.padEnd(14)).join('| '));
for (const size of SIZES)
	console.log(
		String(size).padEnd(7) +
			'| ' +
			MATCHERS.map((m) => median(samples[m.name][`match_ns_${size}`]).toFixed(0).padEnd(14)).join(
				'| ',
			),
	);
for (const f of failures) console.log(`GATE ${f}`);
if (sink === 0) console.log('(sink)');

if (process.env.BENCH_JSON) {
	const payload = {
		suite: 'router-data',
		iterations: ITER,
		targets: MATCHERS.map((m) => ({
			name: m.name,
			ops: Object.fromEntries(
				Object.entries(samples[m.name]).map(([op, ns]) => [
					op,
					timingStatForJson(summarizeSamples(ns)),
				]),
			),
			meta: { failures: failures.filter((f) => f.startsWith(m.name + ' ')) },
		})),
	};
	if (failures.length) payload.failed = 'gates failed: matchers disagree';
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
if (failures.length) process.exit(1);
