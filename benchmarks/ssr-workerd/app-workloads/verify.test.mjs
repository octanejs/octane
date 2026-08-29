import assert from 'node:assert/strict';
import test from 'node:test';
import { contentPresent, verifyGatePrefix, verifyOutput, verifyStats } from './verify.mjs';

// Hand-authored wire fixtures: no renderer, backend-data helper, or compiler
// output generates the expectations used to exercise this independent oracle.
const escape = (value) =>
	String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const proof = (key, value, tag = 'span') => `<${tag} data-proof="${key}">${escape(value)}</${tag}>`;
const shell = '<h1 data-shell="app">Synthetic workspace</h1>';
const carrier = (html) =>
	'<script type="application/json" data-octane-stream>' +
	JSON.stringify(html).replaceAll('<', '\\u003c') +
	'</script>';
const options = (scenario, scale = 1) => ({ scenario, scale, tenant: 'tenant-a' });

function fixture(
	{ scenario, scale, tenant },
	{ streamed = false, reverseItems = false, reverseList = false } = {},
) {
	const workspace = scenario === 'workspace';
	const itemPrefix = workspace ? 'tile' : 'row';
	const resource = workspace ? 'tiles' : `history:${tenant}-detail`;
	const authors = [];
	const items = Array.from({ length: (workspace ? 18 : 40) * scale }, (_, i) => {
		const key = `${itemPrefix}/${i}`;
		let body =
			proof(`${key}/title`, `${tenant}/${resource}/item-${i}`, 'h2') +
			proof(`${key}/text`, `Synthetic entry ${i}: <tag> & "quoted" text.`, 'p') +
			proof(`${key}/code`, `const value = ${i}; // </script> & example`, 'code') +
			proof(`${key}/group-${i % 4}`, `group-${i % 4}`, 'li') +
			proof(`${key}/state-${i % 3}`, `state-${i % 3}`, 'li') +
			proof(`${key}/profile`, `${tenant}/profile`);
		for (const [name, value] of Object.entries({
			scope: `${tenant}/profile`,
			locale: `${tenant}/preferences/locale`,
			theme: `${tenant}/preferences/theme`,
			density: `${tenant}/preferences/density`,
			zone: `${tenant}/preferences/zone`,
			collection: `${tenant}/${workspace ? 'catalog' : 'record'}`,
		}))
			body += proof(`${key}/${name}`, value);
		if (!workspace) authors.push(proof(`${key}/author`, `${tenant}/author:${i % 4}`));
		return `<article data-${itemPrefix}="${i}">${body}</article>`;
	});
	if (reverseItems) items.reverse();
	const links = Array.from({ length: (workspace ? 48 : 6) * scale }, (_, i) =>
		proof(
			`${workspace ? 'nav' : 'related'}/${i}`,
			`${tenant}/${workspace ? 'navigation' : 'related'}/item-${i}`,
			workspace ? 'a' : 'li',
		),
	);
	if (reverseList) links.reverse();
	const fragments = workspace
		? [
				proof('access', `${tenant}/access:${tenant}-detail`),
				`<nav>${proof('navigation/profile', `${tenant}/profile`)}<ul>${links.join('')}</ul></nav>`,
				`<section data-content="workspace">${items.join('')}</section>`,
				proof('summary', `${tenant}/summary`),
			]
		: [
				proof('record', `${tenant}/record`),
				`<section data-content="history">${items.join('')}</section>`,
				`<aside><ul>${links.join('')}</ul></aside>`,
				...authors,
			];
	// Reverse sibling and nested-author payload arrival, never list order.
	return shell + (streamed ? fragments.reverse().map(carrier).join('') : fragments.join(''));
}

function statsFixture({ scenario, tenant }, warm = false) {
	const bootstrap = ['profile', 'preferences', scenario === 'workspace' ? 'catalog' : 'record'];
	const remaining =
		scenario === 'workspace'
			? [`access:${tenant}-detail`, 'navigation', 'tiles', 'summary']
			: [`history:${tenant}-detail`, 'related', 'author:0', 'author:1', 'author:2', 'author:3'];
	const events = [
		...bootstrap.map((resource) => ({ kind: 'start', resource })),
		...bootstrap.map((resource) => ({ kind: 'end', resource })),
		...remaining.flatMap((resource) => [
			{ kind: 'start', resource },
			{ kind: 'end', resource },
		]),
	];
	return {
		done: true,
		active: 0,
		errors: [],
		requestHits: 8,
		backendCalls: warm ? 0 : bootstrap.length + remaining.length,
		dataHits: warm ? bootstrap.length + remaining.length : 0,
		events: warm ? [] : events,
	};
}

for (const scenario of ['workspace', 'history']) {
	for (const scale of [1, 2]) {
		test(`${scenario} scale ${scale}: accepts full inline and reordered streamed payloads`, () => {
			const config = options(scenario, scale);
			for (const streamed of [false, true]) {
				assert.deepEqual(verifyOutput(fixture(config, { streamed }), config), {
					proofCount: scenario === 'workspace' ? 264 * scale + 3 : 526 * scale + 1,
					contentPresent: true,
				});
			}
		});
	}
	test(`${scenario}: rejects missing, duplicate, unrelated, and wrong-valued proofs`, () => {
		const config = options(scenario);
		const html = fixture(config);
		const key = `${scenario === 'workspace' ? 'tile' : 'row'}/0/profile`;
		const value = proof(key, 'tenant-a/profile');
		for (const corrupt of [
			html.replace(value, ''),
			html + value,
			html + proof('unknown', 'extra'),
			html.replace(value, proof(key, 'tenant-b/profile')),
			html.replace('Synthetic entry 0:', 'Wrong entry 0:'),
			html.replace('/preferences/theme', '/preferences/wrong-theme'),
			html.replace(`data-proof="${key}"`, `not-data-proof="${key}"`),
			html + '<article data-row="extra"></article>',
		])
			assert.throws(() => verifyOutput(corrupt, config));
	});
	test(`${scenario}: list order is required although sibling payload order is not`, () => {
		const config = options(scenario);
		assert.throws(
			() => verifyOutput(fixture(config, { reverseItems: true }), config),
			/item order/,
		);
		assert.throws(() => verifyOutput(fixture(config, { reverseList: true }), config), /item order/);
	});
	test(`${scenario}: accepts cold and warm request graphs`, () => {
		for (const warm of [false, true]) {
			const config = { ...options(scenario), warm };
			assert.doesNotThrow(() => verifyStats(statsFixture(config, warm), config));
		}
	});
}

test('rejects missing/duplicate/empty shell and wrong content section', () => {
	const config = options('workspace');
	const html = fixture(config);
	for (const corrupt of [
		html.replace(shell, ''),
		html + shell,
		html.replace('Synthetic workspace', ''),
		html.replace('data-content="workspace"', 'data-content="history"'),
	])
		assert.throws(() => verifyOutput(corrupt, config));
});

test('escaping preserves literal markup, ampersands, quotes and script-closing text', () => {
	const config = options('workspace');
	const html = fixture(config);
	assert.doesNotThrow(() =>
		verifyOutput(
			html
				.replaceAll('&lt;', '&#60;')
				.replaceAll('&gt;', '&#x3e;')
				.replaceAll('&amp;', '&#38;')
				.replaceAll('"quoted"', '&quot;quoted&quot;'),
			config,
		),
	);
	for (const corrupt of [
		html.replace('&lt;tag&gt;', '<tag>'),
		html.replace('&lt;/script&gt;', '</script>'),
	])
		assert.throws(() => verifyOutput(corrupt, config), /Malformed proof/);
	assert.throws(
		() =>
			verifyOutput(
				shell + '<script type="application/json" data-octane-stream>{bad}</script>',
				config,
			),
		/invalid Octane JSON/,
	);
});

test('content milestone needs an actual title, not an empty section or incomplete carrier', () => {
	assert.equal(contentPresent(shell, 'workspace'), false);
	assert.equal(
		contentPresent(shell + '<section data-content="workspace"></section>', 'workspace'),
		false,
	);
	const partial = carrier(
		'<section data-content="workspace">' + proof('tile/0/title', 'first tile', 'h2') + '</section>',
	);
	assert.equal(contentPresent(shell + partial.slice(0, -9), 'workspace'), false);
	assert.equal(contentPresent(shell + partial, 'workspace'), true);
	assert.equal(contentPresent(shell + partial, 'history'), false);
	const title = proof('tile/0/title', 'tenant-a/tiles/item-0', 'h2');
	assert.equal(
		contentPresent('<section data-content="workspace"></section>' + title, 'workspace'),
		false,
	);
	assert.equal(contentPresent('<section data-content="workspace">' + title, 'workspace'), true);
	const config = options('workspace');
	assert.throws(
		() => verifyOutput(fixture(config).replace(title, '') + title, config),
		/outside its section/,
	);
});

test('shell gate tolerates split framing and rejects any resolved data before release', () => {
	const config = { scenario: 'workspace', gate: 'shell' };
	assert.equal(verifyGatePrefix('<h1 data-shell="app">Synthetic', config), false);
	assert.equal(verifyGatePrefix(shell, config), true);
	assert.throws(
		() =>
			verifyGatePrefix(shell + carrier(proof('access', 'tenant-a/access:tenant-a-detail')), config),
		/bypassed shell gate/,
	);
});

test('tail gate rejects buffered sibling and nested payloads before release', () => {
	for (const scenario of ['workspace', 'history']) {
		const config = { scenario, gate: 'tail' };
		const prefix = scenario === 'workspace' ? 'tile' : 'row';
		const primary =
			shell +
			carrier(
				`<section data-content="${scenario}">` +
					proof(`${prefix}/0/title`, 'first item', 'h2') +
					'</section>',
			);
		assert.equal(verifyGatePrefix(shell, config), false);
		assert.equal(verifyGatePrefix(primary, config), true);
		const keys = scenario === 'workspace' ? ['summary'] : ['related/0', 'row/0/author'];
		for (const key of keys)
			assert.throws(
				() => verifyGatePrefix(primary + carrier(proof(key, 'too early')), config),
				/before gate release/,
			);
		assert.throws(
			() => verifyGatePrefix(fixture(options(scenario), { streamed: true }), config),
			/before gate release/,
		);
	}
});

test('stats reject errors, unfinished work, duplicate/missing resources and cache mistakes', () => {
	const config = { ...options('workspace'), warm: false };
	for (const mutate of [
		(s) => {
			s.errors.push('backend failed');
		},
		(s) => {
			s.done = false;
		},
		(s) => {
			s.active = 1;
		},
		(s) => {
			s.requestHits = 0;
		},
		(s) => {
			s.backendCalls++;
		},
		(s) => {
			s.events.push(s.events[0]);
		},
		(s) => {
			s.events.pop();
		},
		(s) => {
			s.events[0].resource = 'wrong-tenant';
		},
		(s) => {
			s.events[0].kind = 'unknown';
		},
	]) {
		const stats = statsFixture(config);
		mutate(stats);
		assert.throws(() => verifyStats(stats, config));
	}
	const warmConfig = { ...config, warm: true };
	const warm = statsFixture(config, true);
	assert.throws(() => verifyStats({ ...warm, backendCalls: 1 }, warmConfig));
	assert.throws(() => verifyStats({ ...warm, dataHits: 6 }, warmConfig));
	assert.throws(() =>
		verifyStats({ ...warm, events: [{ kind: 'start', resource: 'profile' }] }, warmConfig),
	);
});

test('stats reject serialized bootstrap and requests that precede real dependencies', () => {
	for (const scenario of ['workspace', 'history']) {
		const config = { ...options(scenario), warm: false };
		const serial = statsFixture(config);
		const profileEnd = serial.events.splice(3, 1)[0];
		serial.events.splice(1, 0, profileEnd);
		assert.throws(() => verifyStats(serial, config), /bootstrap was serialized/);
		const dependentKeys =
			scenario === 'workspace'
				? ['access:tenant-a-detail']
				: ['history:tenant-a-detail', 'author:0'];
		for (const resource of dependentKeys) {
			const stats = statsFixture(config);
			const start = stats.events.splice(
				stats.events.findIndex((event) => event.kind === 'start' && event.resource === resource),
				1,
			)[0];
			stats.events.splice(3, 0, start);
			assert.throws(() => verifyStats(stats, config), /Dependency started early/);
		}
	}
});
