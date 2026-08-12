import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDoomAudit } from './doom-audit.mjs';

const complete = {
	provenance: {
		repository: 'https://github.com/eugeniosegala/doom-react-three-fiber',
		commit: 'b48daeb3f91b8d8175a1d59d6a9c0c6c3b47caa0',
		license: 'NOASSERTION',
		vendored: false,
	},
	attestations: {
		oracleResearcher: 'isolated-agent-context',
		migrationImplementer: 'clean-room-context',
		reviewer: 'octane-maintainer',
	},
	behaviors: [
		{
			id: 'route-landing',
			required: true,
			observation: 'The root route presents a landing state.',
			evidence: [{ kind: 'browser', target: 'doom landing route' }],
		},
	],
	constructs: [
		{
			id: 'react-composition',
			family: 'React',
			classification: 'mechanically-transformed',
			evidence: 'Octane TSRX components and hooks',
		},
	],
	assets: [
		{
			id: 'procedural-audio',
			path: 'playground/octane/src/demos/doom/assets.ts',
			sha256: '34f7be50229470546985a112181d6d9dd8f345e8f461ae1838a4c2cb8c4282ae',
			kind: 'source-authored',
			license: 'MIT',
			creator: 'Octane contributors',
			role: 'Synthesized audio cues',
		},
		{
			id: 'procedural-visual-shell',
			path: 'playground/octane/src/demos/doom/Doom.tsrx',
			sha256: 'dc838f7de4ad105249a5060da0608c2e78783dc0074a333bdf1d4b3b6a914414',
			kind: 'source-authored',
			license: 'MIT',
			creator: 'Octane contributors',
			role: 'DOM/HUD visual presentation',
		},
	],
};

test('accepts an exhaustive clean-room audit', () => {
	assert.doesNotThrow(() => validateDoomAudit(complete));
});

test('rejects missing mappings and duplicate identities', () => {
	assert.throws(() => validateDoomAudit({ ...complete, behaviors: [] }), /at least one behavior/);
	assert.throws(
		() =>
			validateDoomAudit({ ...complete, behaviors: [...complete.behaviors, complete.behaviors[0]] }),
		/duplicate behavior id/,
	);
});

test('rejects required behavior without executable or enumerated manual evidence', () => {
	const behavior = { ...complete.behaviors[0], evidence: [] };
	assert.throws(
		() => validateDoomAudit({ ...complete, behaviors: [behavior] }),
		/required behavior route-landing has no evidence/,
	);
});

test('rejects unclassified constructs and unlicensed assets', () => {
	assert.throws(
		() =>
			validateDoomAudit({
				...complete,
				constructs: [{ ...complete.constructs[0], classification: '' }],
			}),
		/construct react-composition has invalid classification/,
	);
	assert.throws(
		() =>
			validateDoomAudit({
				...complete,
				assets: [{ ...complete.assets[0], license: 'NOASSERTION' }],
			}),
		/asset procedural-audio lacks redistribution permission/,
	);
	assert.throws(
		() =>
			validateDoomAudit({
				...complete,
				assets: [{ ...complete.assets[0], sha256: 'not-a-digest' }],
			}),
		/sha256 must be a full digest/,
	);
});

test('rejects browser and unit evidence targets outside the Doom suite', () => {
	const scenarioNames = new Set(['doom landing route']);
	assert.doesNotThrow(() => validateDoomAudit(complete, { scenarioNames }));
	assert.throws(
		() =>
			validateDoomAudit(
				{
					...complete,
					behaviors: [
						{
							...complete.behaviors[0],
							evidence: [{ kind: 'browser', target: 'world collision' }],
						},
					],
				},
				{ scenarioNames },
			),
		/exact Doom suite scenario/,
	);
});
