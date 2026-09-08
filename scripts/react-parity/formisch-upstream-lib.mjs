import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { toPortablePath } from './harness-lib.mjs';
import { extractTestCases } from './inventory-lib.mjs';
import ts from 'typescript';

const REACT_UPSTREAM = 'packages/formisch/upstream/frameworks/react/src';
const REACT_ADAPTED = 'packages/formisch/tests/upstream/frameworks/react/src';
const CORE_UPSTREAM = 'packages/formisch/upstream/packages/core/src';
const METHODS_UPSTREAM = 'packages/formisch/upstream/packages/methods/src';
const ADAPTED_REACT_FINGERPRINTS = 'packages/formisch/audit/adapted-react-source-fingerprints.json';
const RUNTIME_INVENTORIES = [
	'packages/formisch/audit/pristine-runtime-core.json',
	'packages/formisch/audit/pristine-runtime-methods.json',
	'packages/formisch/audit/pristine-runtime-react.json',
	'packages/formisch/audit/adapted-runtime-core-methods.json',
	'packages/formisch/audit/adapted-runtime-resolver-canary.json',
	'packages/formisch/audit/adapted-runtime-react.json',
];
const printer = ts.createPrinter({ removeComments: true });

function expectSignaturesByTest(source, file) {
	const sourceFile = ts.createSourceFile(
		file,
		source.replaceAll('@{', ' {'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const tests = [];
	function isRootedAtExpect(node) {
		if (ts.isCallExpression(node)) {
			if (ts.isIdentifier(node.expression) && node.expression.text === 'expect') return true;
			return isRootedAtExpect(node.expression);
		}
		if (ts.isPropertyAccessExpression(node)) return isRootedAtExpect(node.expression);
		return false;
	}
	function expectCalls(node) {
		const calls = [];
		function visit(current) {
			if (ts.isCallExpression(current) && isRootedAtExpect(current)) {
				const parent = current.parent;
				if (
					!(ts.isPropertyAccessExpression(parent) && parent.expression === current) &&
					!(ts.isCallExpression(parent) && parent.expression === current)
				) {
					calls.push(
						printer
							.printNode(ts.EmitHint.Unspecified, current, sourceFile)
							.replace(/\s+/g, ' ')
							.trim(),
					);
					return;
				}
			}
			ts.forEachChild(current, visit);
		}
		visit(node);
		return calls;
	}
	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			['test', 'it'].includes(node.expression.text) &&
			(ts.isStringLiteral(node.arguments[0]) ||
				ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
		) {
			tests.push({ title: node.arguments[0].text, assertions: expectCalls(node.arguments[1]) });
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return tests;
}

function filesBelow(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => resolve(entry.parentPath ?? entry.path, entry.name))
		.sort();
}

function runtimeTests(root, extension) {
	return filesBelow(root)
		.map((file) => toPortablePath(relative(root, file)))
		.filter((file) => file.endsWith(extension));
}

export function formischUpstreamIntegrity(repoRoot) {
	const upstreamRoot = resolve(repoRoot, 'packages/formisch/upstream');
	const hash = createHash('sha256');
	for (const file of filesBelow(upstreamRoot)) {
		hash.update(toPortablePath(relative(upstreamRoot, file)));
		hash.update('\0');
		hash.update(readFileSync(file));
		hash.update('\0');
	}
	return hash.digest('hex');
}

const sourceSha256 = (source) => createHash('sha256').update(source).digest('hex');

export function compareAdaptedReactFile(upstreamSource, adaptedSource, file, fingerprints) {
	if (
		fingerprints &&
		(sourceSha256(upstreamSource) !== fingerprints.upstreamSha256 ||
			sourceSha256(adaptedSource) !== fingerprints.adaptedSha256)
	)
		throw new Error(`${file}: adapted React source fingerprint drifted`);
	if (
		/\b(?:fdescribe|fit|xdescribe|xit|xtest)(?:\s*\(|\.each\s*\()|\b(?:describe|it|test)\.(?:failing|only|skip|todo)(?:\s*\(|\.each\s*\()/.test(
			adaptedSource,
		)
	) {
		throw new Error(`${file}: adapted test contains a focused, skipped, failing, or todo marker`);
	}
	const upstreamCases = extractTestCases(upstreamSource, { file }).map(({ title }) => title);
	const adaptedCases = extractTestCases(adaptedSource, { file }).map(({ title }) => title);
	if (JSON.stringify(upstreamCases) !== JSON.stringify(adaptedCases)) {
		throw new Error(`${file}: adapted React case registrations drifted from upstream`);
	}
	if (
		JSON.stringify(expectSignaturesByTest(upstreamSource, file)) !==
		JSON.stringify(expectSignaturesByTest(adaptedSource, file))
	) {
		throw new Error(`${file}: adapted React assertions drifted from upstream`);
	}
	return upstreamCases.length;
}

export function verifyFormischUpstream(repoRoot, { integrity } = {}) {
	const upstreamReactRoot = resolve(repoRoot, REACT_UPSTREAM);
	const adaptedReactRoot = resolve(repoRoot, REACT_ADAPTED);
	const upstreamReact = runtimeTests(upstreamReactRoot, '.test.tsx');
	const adaptedReact = runtimeTests(adaptedReactRoot, '.test.tsrx');
	const expectedAdapted = upstreamReact.map((file) => file.replace(/\.test\.tsx$/, '.test.tsrx'));
	if (JSON.stringify(adaptedReact) !== JSON.stringify(expectedAdapted)) {
		throw new Error('Formisch adapted React suite must account for every upstream runtime file');
	}
	const fingerprintLedger = JSON.parse(
		readFileSync(resolve(repoRoot, ADAPTED_REACT_FINGERPRINTS), 'utf8'),
	);
	if (
		fingerprintLedger.schemaVersion !== 1 ||
		JSON.stringify(fingerprintLedger.files.map((entry) => entry.path)) !==
			JSON.stringify(upstreamReact)
	)
		throw new Error('Formisch adapted React source fingerprints are incomplete or stale');
	const fingerprintsByPath = new Map(fingerprintLedger.files.map((entry) => [entry.path, entry]));

	let reactCases = 0;
	for (const upstreamFile of upstreamReact) {
		const adaptedFile = upstreamFile.replace(/\.test\.tsx$/, '.test.tsrx');
		reactCases += compareAdaptedReactFile(
			readFileSync(resolve(upstreamReactRoot, upstreamFile), 'utf8'),
			readFileSync(resolve(adaptedReactRoot, adaptedFile), 'utf8'),
			upstreamFile,
			fingerprintsByPath.get(upstreamFile),
		);
	}

	const inventoryFiles = new Set();
	let inventoryCases = 0;
	for (const inventoryPath of RUNTIME_INVENTORIES) {
		let inventory;
		try {
			inventory = JSON.parse(readFileSync(resolve(repoRoot, inventoryPath), 'utf8'));
		} catch (error) {
			if (error.code === 'ENOENT')
				throw new Error(`missing Formisch runtime inventory: ${inventoryPath}`);
			throw error;
		}
		for (const file of inventory.files) inventoryFiles.add(file);
		inventoryCases += inventory.tests.length;
	}
	const coreFiles = runtimeTests(resolve(repoRoot, CORE_UPSTREAM), '.test.ts').length;
	const methodFiles = runtimeTests(resolve(repoRoot, METHODS_UPSTREAM), '.test.ts').length;
	if (coreFiles !== 18 || methodFiles !== 23 || upstreamReact.length !== 7 || reactCases !== 42) {
		throw new Error('Formisch upstream runtime inventory changed; review the pinned release');
	}
	if (inventoryFiles.size !== 57 || inventoryCases !== 1099) {
		throw new Error('Formisch runtime execution inventories are incomplete or stale');
	}
	const actualIntegrity = formischUpstreamIntegrity(repoRoot);
	if (integrity && actualIntegrity !== integrity) {
		throw new Error('Formisch vendored upstream tree drifted from its pinned integrity');
	}
	return { coreFiles, methodFiles, reactFiles: upstreamReact.length, reactCases, actualIntegrity };
}
