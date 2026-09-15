import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	assertPristineOracleEnvironment,
	parseJUnitIdentities,
} from './alien-signals-pristine-runtime.mjs';

test('checks an oracle package whose exports hide package metadata', (t) => {
	const root = mkdtempSync(join(tmpdir(), 'alien-oracle-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const directory = join(root, 'node_modules', 'test-engine');
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, 'package.json'),
		JSON.stringify({ name: 'test-engine', version: '3.2.1', exports: { '.': './index.mjs' } }),
	);
	writeFileSync(
		join(directory, 'index.mjs'),
		'throw new Error("the version check must not execute package code");',
	);
	const environmentPath = join(root, 'oracle.json');
	writeFileSync(environmentPath, JSON.stringify({ packages: { 'test-engine': '3.2.1' } }));
	assert.deepEqual(assertPristineOracleEnvironment({ environmentPath, fromPath: root }).packages, {
		'test-engine': '3.2.1',
	});
	writeFileSync(environmentPath, JSON.stringify({ packages: { 'test-engine': '3.2.2' } }));
	assert.throws(
		() => assertPristineOracleEnvironment({ environmentPath, fromPath: root }),
		/environment drift/,
	);
});

test('preserves nested Bun suite identity, XML text, failures and skips', () => {
	const records = parseJUnitIdentities(
		'<testsuite><testcase name="reads &lt;x&gt; &amp; y" classname="inner &amp;gt; outer"/><testcase name="broken" classname="outer"><failure/></testcase><testcase name="later" classname="outer"><skipped/></testcase></testsuite>',
	);
	assert.deepEqual(
		records.map(({ fullName, status }) => ({ fullName, status })),
		[
			{ fullName: 'outer broken', status: 'failed' },
			{ fullName: 'outer inner reads <x> & y', status: 'passed' },
			{ fullName: 'outer later', status: 'skipped' },
		],
	);
});
