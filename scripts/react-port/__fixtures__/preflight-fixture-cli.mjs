#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assessResolvedEvidence } from '../preflight-lib.mjs';
import { main } from '../preflight.mjs';

let argumentsList = process.argv.slice(2);
if (argumentsList[0] === '--') argumentsList = argumentsList.slice(1);
const fixtureIndex = argumentsList.indexOf('--fixture-evidence');
if (fixtureIndex === -1 || !argumentsList[fixtureIndex + 1]) {
	process.stderr.write('Fixture harness requires --fixture-evidence <file>\n');
	process.exitCode = 2;
} else {
	const fixturePath = argumentsList[fixtureIndex + 1];
	argumentsList.splice(fixtureIndex, 2);
	const fixture = JSON.parse(readFileSync(path.resolve(fixturePath), 'utf8'));
	if (fixture.schemaVersion !== 1 || !fixture.targets || typeof fixture.targets !== 'object') {
		throw new Error('Fixture evidence must use schemaVersion 1 and contain a targets object');
	}
	await main({
		argumentsList,
		resolve: async (_parsedInput, rawInput) => {
			const evidence = fixture.targets[rawInput];
			if (!evidence) throw new Error(`Fixture evidence has no target for ${rawInput}`);
			return {
				...assessResolvedEvidence({ input: rawInput, ...evidence }),
				runtimeDependencies: evidence.registry?.runtimeDependencies ?? {},
			};
		},
	});
}
