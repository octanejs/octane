#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const pristinePath = resolve(root, 'packages/select/audit/pristine-runtime.json');
const adaptedPath = resolve(root, 'packages/select/audit/adapted-runtime.json');
const destination = resolve(root, 'packages/select/audit/adaptation.json');
const expectedPristineCases = 255;
const expectedAdaptedCases = 255;

// Upstream registers these three identities with skip/test.skip. They never enter
// pristine-runtime.json (jest-full inventories keep only passed cases), but every
// upstream case still needs an adapted or individually justified disposition.
export const canonicalSkippedCases = [
	{
		id: 'src/__tests__/Async.test.tsx\0in case of callbacks should handle an error by setting options to an empty array',
		upstreamFile: 'src/__tests__/Async.test.tsx',
		fullName: 'in case of callbacks should handle an error by setting options to an empty array',
		disposition: 'not-applicable',
		reason:
			'Pinned react-select leaves this as an open product question rather than an asserted Async contract; adapting it would invent callback-error → empty-options semantics the published package does not ship.',
	},
	{
		id: 'src/__tests__/Select.test.tsx\0clicking on select using secondary button on mouse single select > secondary click is ignored > should not call onMenuOpen and onMenuClose prop',
		upstreamFile: 'src/__tests__/Select.test.tsx',
		fullName:
			'clicking on select using secondary button on mouse single select > secondary click is ignored > should not call onMenuOpen and onMenuClose prop',
		disposition: 'not-applicable',
		reason:
			'Upstream marks this matrix entry skipped because its asserted secondary-button menu gating conflicts with observed browser behavior on the pin; encoding it would invent a contested oracle rather than adapt a shipped contract.',
	},
	{
		id: 'src/__tests__/Select.test.tsx\0clicking on select using secondary button on mouse multi select > secondary click is ignored > should not call onMenuOpen and onMenuClose prop',
		upstreamFile: 'src/__tests__/Select.test.tsx',
		fullName:
			'clicking on select using secondary button on mouse multi select > secondary click is ignored > should not call onMenuOpen and onMenuClose prop',
		disposition: 'not-applicable',
		reason:
			'Upstream marks this matrix entry skipped because its asserted secondary-button menu gating conflicts with observed browser behavior on the pin; encoding it would invent a contested oracle rather than adapt a shipped contract.',
	},
];

function upstreamFileFor(adaptedFile) {
	const adaptedBasename = basename(adaptedFile);
	if (!adaptedBasename.endsWith('.test.ts')) {
		throw new Error(`Unexpected adapted test path: ${adaptedFile}`);
	}
	return `src/__tests__/${adaptedBasename.slice(0, -2)}tsx`;
}

function identity(file, fullName, occurrence) {
	const base = `${file}\0${fullName}`;
	return occurrence === 0 ? base : `${base}\0${occurrence + 1}`;
}

function normalizedName(fullName) {
	return fullName.replaceAll(' > ', ' ');
}

export function buildAdaptationInventory(pristine, adapted) {
	if (pristine.tests.length !== expectedPristineCases) {
		throw new Error(
			`Expected ${expectedPristineCases} pristine cases, received ${pristine.tests.length}`,
		);
	}
	const suites = new Set(
		pristine.tests.map(function pristineFile(test) {
			return test.file;
		}),
	);
	if (suites.size !== 5) throw new Error(`Expected 5 pristine suites, received ${suites.size}`);
	if (adapted.tests.length !== expectedAdaptedCases) {
		throw new Error(
			`Expected ${expectedAdaptedCases} adapted cases, received ${adapted.tests.length}`,
		);
	}

	const pristineOccurrences = new Map();
	const pristineMatchOccurrences = new Map();
	const pristineKeys = new Set();
	const pristineEntries = pristine.tests.map(function indexPristine(test) {
		if (test.status !== 'passed') {
			throw new Error(`Pristine case did not pass: ${test.file} ${test.fullName}`);
		}
		const key = `${test.file}\0${test.fullName}`;
		const occurrence = pristineOccurrences.get(key) ?? 0;
		pristineOccurrences.set(key, occurrence + 1);
		const id = identity(test.file, test.fullName, occurrence);
		const matchBase = `${test.file}\0${normalizedName(test.fullName)}`;
		const matchOccurrence = pristineMatchOccurrences.get(matchBase) ?? 0;
		pristineMatchOccurrences.set(matchBase, matchOccurrence + 1);
		const matchId = identity(test.file, normalizedName(test.fullName), matchOccurrence);
		pristineKeys.add(matchId);
		return { ...test, id, matchId };
	});

	const adaptedOccurrences = new Map();
	const adaptedKeys = new Map();
	for (const test of adapted.tests) {
		if (test.status !== undefined && test.status !== 'passed') {
			throw new Error(`Adapted case did not pass: ${test.file} ${test.fullName}`);
		}
		const upstreamFile = upstreamFileFor(test.file);
		const base = `${upstreamFile}\0${test.fullName}`;
		const occurrence = adaptedOccurrences.get(base) ?? 0;
		adaptedOccurrences.set(base, occurrence + 1);
		const key = identity(upstreamFile, test.fullName, occurrence);
		if (!pristineKeys.has(key)) {
			throw new Error(`Adapted case has no pristine identity: ${upstreamFile} ${test.fullName}`);
		}
		if (adaptedKeys.has(key)) throw new Error(`Duplicate adapted identity: ${key}`);
		adaptedKeys.set(key, test.file);
	}

	const adaptedCases = pristineEntries.map(function classify(test) {
		const adaptedFile = adaptedKeys.get(test.matchId);
		if (adaptedFile) {
			return {
				id: test.id,
				upstreamFile: test.file,
				fullName: test.fullName,
				disposition: 'adapted',
				adaptedFile,
			};
		}
		throw new Error(`Pristine case has no adaptation: ${test.file} ${test.fullName}`);
	});

	const skippedIds = new Set(
		canonicalSkippedCases.map(function skippedId(entry) {
			return entry.id;
		}),
	);
	if (skippedIds.size !== canonicalSkippedCases.length) {
		throw new Error('Canonical skipped identities must be unique');
	}
	for (const entry of pristineEntries) {
		if (skippedIds.has(entry.id)) {
			throw new Error(`Canonical skipped identity unexpectedly passed pristine: ${entry.id}`);
		}
	}

	const cases = [...adaptedCases, ...canonicalSkippedCases].sort(function byId(left, right) {
		return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
	});

	return {
		schemaVersion: 1,
		upstreamCases: pristineEntries.length + canonicalSkippedCases.length,
		adaptedCases: adaptedKeys.size,
		notApplicableCases: canonicalSkippedCases.length,
		pendingCases: cases.filter(function pending(entry) {
			return entry.disposition === 'pending';
		}).length,
		permittedTransforms: [
			'import React APIs from Octane equivalents',
			're-author JSX component fixtures as compiled .tsrx components',
			'replace React Testing Library mounting with @octanejs/testing-library',
			'replace React synthetic input events with equivalent native input events',
			'replace Jest mocks with Vitest mocks',
			'preserve upstream suite and test titles exactly',
		],
		cases,
	};
}

if (process.argv.includes('--write')) {
	const pristine = JSON.parse(readFileSync(pristinePath, 'utf8'));
	const adapted = JSON.parse(readFileSync(adaptedPath, 'utf8'));
	const inventory = buildAdaptationInventory(pristine, adapted);
	writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(
		`packages/select/audit/adaptation.json: ${inventory.adaptedCases} adapted, ${inventory.notApplicableCases} not applicable, ${inventory.pendingCases} pending (${inventory.upstreamCases} upstream)`,
	);
}
