import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { renderScaffold, scaffoldReactPort, suggestTriage } from './scaffold-react-port.mjs';

describe('renderScaffold', () => {
	test('keeps suggested and dynamic registrations in the review checklist', () => {
		const cases = [
			{
				kind: 'test',
				title: 'supports a legacy root outcome',
				line: 7,
				modifiers: ['skip'],
				gate: 'enableLegacyMode',
				caseId: 'ReactExample-test.js:7:test:0',
			},
			{
				kind: 'test.each',
				title: 'renders row one',
				line: 11,
				parameterization: { row: 0, count: 2 },
			},
			{
				kind: 'test',
				title: null,
				line: 15,
				dynamic: true,
				manualReviewReason: 'title is computed by getTitle()',
			},
		];

		const scaffold = renderScaffold(cases, '/react/ReactExample-test.js');

		assert.equal((scaffold.match(/\bit\.todo\(/g) ?? []).length, cases.length);
		assert.match(scaffold, /supports a legacy root outcome/);
		assert.match(scaffold, /Automated triage suggestion:/);
		assert.match(scaffold, /Upstream modifiers: skip/);
		assert.match(scaffold, /Feature gate: enableLegacyMode/);
		assert.match(scaffold, /Parameterization: row=0; count=2/);
		assert.match(scaffold, /MANUAL REVIEW: title is computed by getTitle\(\)/);
		assert.match(scaffold, /\[manual review\] test at ReactExample-test\.js:15/);
		assert.doesNotMatch(scaffold, /Out of scope|intentionally NOT ported|skipped \(see bottom\)/);
	});

	test('does not blanket-classify newly supported React surfaces', () => {
		for (const title of [
			'renders a Fizz streaming response',
			'preloads and hoists singleton resources',
			'React.Children.map preserves keys',
			'runs a ViewTransition callback',
		]) {
			assert.equal(suggestTriage(title), null, title);
		}
	});

	test('normalizes CoffeeScript test filenames in the generated suite name', () => {
		assert.match(
			renderScaffold([], '/react/ReactCoffeeScriptClass-test.coffee'),
			/describe\("ReactCoffeeScriptClass \(ported\)"/,
		);
	});
});

describe('scaffoldReactPort', () => {
	test('uses the shared inventory extractor and exposes every registration', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'octane-react-scaffold-'));
		const reactFile = join(directory, 'ReactExample-test.js');
		await writeFile(
			reactFile,
			`// @gate enableExample
test.skip('modifier case', () => {});
itRenders('server helper', async render => {});
itClientRenders('client helper', async render => {});
itThrowsWhenRendering('throw helper', async render => {});
test.each([
  ['alpha'],
  ['beta'],
])('matrix %s', value => {});
test(getTitle(), () => {});
testCustomMatrix('custom helper', () => {});
`,
		);

		const { cases, skeleton } = scaffoldReactPort(reactFile);
		const estimatedRegistrations = cases.reduce(
			(total, testCase) => total + (testCase.estimatedRegistrations ?? 1),
			0,
		);

		assert.ok(
			estimatedRegistrations >= 7,
			`expected matrix/helper expansion and a manual marker, got ${estimatedRegistrations}`,
		);
		assert.equal((skeleton.match(/\bit\.todo\(/g) ?? []).length, cases.length);
		assert.match(skeleton, /modifier case/);
		assert.match(skeleton, /server helper/);
		assert.match(skeleton, /client helper/);
		assert.match(skeleton, /throw helper/);
		assert.match(skeleton, /matrix alpha/);
		assert.match(skeleton, /matrix beta/);
		assert.match(skeleton, /Upstream modifiers: skip/);
		assert.match(skeleton, /Feature gate: enableExample/);
		assert.match(skeleton, /MANUAL REVIEW:/);
		assert.match(skeleton, /Possible custom registrar appears 1 time/);
		assert.match(skeleton, /testCustomMatrix/);
	});
});
