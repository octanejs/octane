import assert from 'node:assert/strict';
import { semanticHtmlForVerification } from '../../lib/stream-verify.mjs';

// These are wire-payload checks, not a reconstruction of the final DOM. In
// particular, nested/sibling boundary payloads may arrive outside their parent.
const semantic = (html) =>
	semanticHtmlForVerification('app-workloads', html).replace(/<!--[\s\S]*?-->/g, '');
const attribute = (attrs, name) =>
	attrs
		.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`))
		?.slice(1)
		.find((v) => v !== undefined);
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))];
const ids = (count) => Array.from({ length: count }, (_, i) => String(i));
const scenarios = new Set(['workspace', 'history']);

function decodeText(text) {
	assert(!text.includes('<'), 'Proof text contains unescaped markup');
	const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
	return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
		if (entity[0] !== '#') return entities[entity.toLowerCase()];
		const code =
			entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
		return code <= 0x10ffff ? String.fromCodePoint(code) : match;
	});
}

function proofEntries(html) {
	const entries = [];
	for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>([^<]*)<\/\1\s*>/gi)) {
		const key = attribute(match[2], 'data-proof');
		if (key !== undefined) entries.push([key, decodeText(match[3])]);
	}
	assert.equal(
		entries.length,
		[...html.matchAll(/\bdata-proof=/g)].length,
		'Malformed proof element',
	);
	return entries;
}

export function contentPresent(html, scenario) {
	assert(scenarios.has(scenario), 'Unknown scenario');
	const decoded = semantic(html);
	const prefix = scenario === 'workspace' ? 'tile' : 'row';
	// A partial wire prefix can include the first item before the section closes.
	// These fixtures have no nested sections; sibling payloads outside a closed
	// primary section must not impersonate its first-content milestone.
	const sections = decoded.matchAll(/<section\b([^>]*)>([\s\S]*?)(?:<\/section>|$)/g);
	for (const section of sections) {
		if (attribute(section[1], 'data-content') !== scenario) continue;
		if (
			new RegExp(
				`<h2\\b[^>]*\\sdata-proof=(?:"${prefix}/0/title"|'${prefix}/0/title')[^>]*>[^<]+</h2>`,
			).test(section[2])
		)
			return true;
	}
	return false;
}

// Untimed gate preflights wait for a complete milestone rather than assuming
// any particular first-chunk framing. Tail payloads must still be withheld.
export function verifyGatePrefix(html, { scenario, gate }) {
	assert(scenarios.has(scenario), 'Unknown scenario');
	assert(gate === 'shell' || gate === 'tail', 'Unknown gate');
	const decoded = semantic(html);
	const proofs = [...decoded.matchAll(/<[a-z][\w:-]*\b([^>]*)>/gi)]
		.map((tag) => attribute(tag[1], 'data-proof'))
		.filter((key) => key !== undefined);
	if (gate === 'shell') {
		assert.equal(proofs.length, 0, 'Data bypassed shell gate');
		return [...decoded.matchAll(/<h1\b([^>]*)>([^<]+)<\/h1>/g)].some(
			(match) =>
				attribute(match[1], 'data-shell') === 'app' &&
				decodeText(match[2]) === 'Synthetic workspace',
		);
	}
	const tail =
		scenario === 'workspace'
			? (key) => key === 'summary'
			: (key) => key.startsWith('related/') || /^row\/[^/]+\/author$/.test(key);
	assert(!proofs.some(tail), 'Tail data arrived before gate release');
	return contentPresent(html, scenario);
}

export function verifyOutput(html, { scenario, tenant, scale }) {
	assert(scenarios.has(scenario), 'Unknown scenario');
	assert(Number.isInteger(scale) && scale >= 1 && scale <= 4, 'Invalid scale');
	const decoded = semantic(html);
	const shells = [...decoded.matchAll(/<h1\b([^>]*)>([^<]*)<\/h1>/g)].filter(
		(match) => attribute(match[1], 'data-shell') !== undefined,
	);
	assert.equal(shells.length, 1, 'Expected one nonempty shell');
	assert.equal(attribute(shells[0][1], 'data-shell'), 'app');
	assert.equal(decodeText(shells[0][2]), 'Synthetic workspace');
	assert.equal([...decoded.matchAll(/\bdata-shell=/g)].length, 1, 'Duplicate or malformed shell');
	const sections = [...decoded.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].filter(
		(match) => attribute(match[1], 'data-content') !== undefined,
	);
	assert.equal(sections.length, 1, 'Expected one content section');
	assert.equal(attribute(sections[0][1], 'data-content'), scenario);
	assert.equal([...decoded.matchAll(/\bdata-content=/g)].length, 1);
	const expected = [];
	const add = (key, value) => expected.push([key, value]);
	const workspace = scenario === 'workspace';
	const prefix = workspace ? 'tile' : 'row';
	const resource = workspace ? 'tiles' : `history:${tenant}-detail`;
	const count = (workspace ? 18 : 40) * scale;
	for (let i = 0; i < count; i++) {
		const key = `${prefix}/${i}`;
		add(`${key}/title`, `${tenant}/${resource}/item-${i}`);
		add(`${key}/text`, `Synthetic entry ${i}: <tag> & "quoted" text.`);
		add(`${key}/code`, `const value = ${i}; // </script> & example`);
		for (const tag of [`group-${i % 4}`, `state-${i % 3}`]) add(`${key}/${tag}`, tag);
		add(`${key}/profile`, `${tenant}/profile`);
		add(`${key}/scope`, `${tenant}/profile`);
		for (const context of ['locale', 'theme', 'density', 'zone'])
			add(`${key}/${context}`, `${tenant}/preferences/${context}`);
		add(`${key}/collection`, `${tenant}/${workspace ? 'catalog' : 'record'}`);
		if (!workspace) add(`${key}/author`, `${tenant}/author:${i % 4}`);
	}
	const listPrefix = workspace ? 'nav' : 'related';
	const listCount = (workspace ? 48 : 6) * scale;
	for (let i = 0; i < listCount; i++)
		add(`${listPrefix}/${i}`, `${tenant}/${workspace ? 'navigation' : 'related'}/item-${i}`);
	if (workspace) {
		add('navigation/profile', `${tenant}/profile`);
		add('access', `${tenant}/access:${tenant}-detail`);
		add('summary', `${tenant}/summary`);
	} else add('record', `${tenant}/record`);
	const actual = proofEntries(decoded);
	const byKey = ([a], [b]) => a.localeCompare(b);
	assert.deepEqual([...actual].sort(byKey), expected.sort(byKey), 'Incorrect proof keys or values');
	const itemIds = (fragment) =>
		tags(fragment, 'article')
			.map((tag) => attribute(tag[1], `data-${prefix}`))
			.filter((id) => id !== undefined);
	assert.deepEqual(itemIds(sections[0][2]), ids(count), 'Content item order');
	assert.deepEqual(itemIds(decoded), ids(count), 'Unexpected content items');
	assert.equal(
		[...decoded.matchAll(/\bdata-(?:tile|row)=/g)].length,
		count,
		'Unexpected item markers',
	);
	const containers = [
		...decoded.matchAll(
			new RegExp(
				`<${workspace ? 'nav' : 'aside'}\\b[^>]*>([\\s\\S]*?)</${workspace ? 'nav' : 'aside'}>`,
				'g',
			),
		),
	];
	assert.equal(containers.length, 1, 'Expected one navigation/related container');
	const lists = [...containers[0][1].matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)];
	assert.equal(lists.length, 1, 'Expected one navigation/related list');
	assert.deepEqual(
		proofEntries(lists[0][1]).map(([key]) => key),
		ids(listCount).map((id) => `${listPrefix}/${id}`),
		'Navigation/related item order',
	);
	const present = contentPresent(html, scenario);
	assert(present, 'Primary content title is outside its section');
	return { proofCount: actual.length, contentPresent: present };
}

export function verifyStats(stats, { scenario, tenant, warm }) {
	assert(scenarios.has(scenario), 'Unknown scenario');
	const workspace = scenario === 'workspace';
	const bootstrap = ['profile', 'preferences', workspace ? 'catalog' : 'record'];
	const resources = workspace
		? [...bootstrap, `access:${tenant}-detail`, 'navigation', 'tiles', 'summary']
		: [
				...bootstrap,
				`history:${tenant}-detail`,
				'related',
				'author:0',
				'author:1',
				'author:2',
				'author:3',
			];
	assert.deepEqual(stats.errors, [], 'Request errors');
	assert.equal(stats.done, true, 'Request work did not finish');
	assert.equal(stats.active, 0, 'Outstanding backend work');
	assert(stats.requestHits > 0, 'Shared loaders did not deduplicate');
	assert.equal(stats.backendCalls, warm ? 0 : resources.length, 'Backend call count');
	assert.equal(stats.dataHits, warm ? resources.length : 0, 'Data cache hit count');
	assert(Array.isArray(stats.events));
	if (warm) {
		assert.deepEqual(stats.events, [], 'Warm cache performed backend work');
		return;
	}
	for (const event of stats.events) assert(['start', 'end'].includes(event.kind), 'Unknown event');
	for (const kind of ['start', 'end'])
		assert.deepEqual(
			stats.events
				.filter((event) => event.kind === kind)
				.map((event) => event.resource)
				.sort(),
			[...resources].sort(),
			`Missing or duplicate ${kind} resource`,
		);
	const index = (kind, resource) =>
		stats.events.findIndex((event) => event.kind === kind && event.resource === resource);
	for (const resource of resources)
		assert(index('end', resource) > index('start', resource), 'End precedes start');
	assert(
		Math.max(...bootstrap.map((key) => index('start', key))) <
			Math.min(...bootstrap.map((key) => index('end', key))),
		'Independent bootstrap was serialized',
	);
	const dependencies = workspace
		? [['profile', `access:${tenant}-detail`]]
		: [
				['record', `history:${tenant}-detail`],
				...ids(4).map((id) => [`history:${tenant}-detail`, `author:${id}`]),
			];
	for (const [before, after] of dependencies)
		assert(index('start', after) > index('end', before), `Dependency started early: ${after}`);
}
