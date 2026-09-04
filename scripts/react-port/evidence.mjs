#!/usr/bin/env node

import { execFile } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
	auditShippedClosure,
	assertCurrentEvidenceMatrix,
	createEvidenceMatrix,
	evaluateVerificationReadiness,
	inspectBindingPackage,
	isCurrentEvidenceMatrix,
	recordEvidence,
	validateUpstreamCrosswalk,
} from './evidence-lib.mjs';
import { sanitizeForReport } from './preflight-lib.mjs';
import {
	acquireBatchLock,
	assertPlannedPathIsSafe,
	detectNodeWorktreeCollisions,
	releaseBatchLock,
	transitionNodeState,
	validateBatchManifest,
	writeManifestAtomically,
} from './state-lib.mjs';
import { credentialValuesFromEnvironment } from './report-lib.mjs';
import { concretePublicSpecifiers, inspectPublicExports } from './public-exports.mjs';
import {
	discoverPackageTests,
	discoverReportEligiblePackageTests,
	isConventionalPackageTestFile,
} from './package-tests-lib.mjs';
import {
	isNodeTestInvocation,
	nodeRuntimeOptionBoundary,
} from './node-test-invocation-wrapper.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_COMMAND_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const PARITY_GATES = new Set([
	'differential-surface',
	'identity-lifecycle',
	'server-snapshot',
	'differential-events',
	'focus-ref-keyed',
	'browser',
	'provider-identity',
	'portal-lifecycle',
	'ssr-hydration',
	'async-lifecycle',
	'performance',
]);
const PACK_GATES = new Set([
	'packed-source-types-node',
	'packed-source-types-browser',
	'package-pack',
]);
const TYPESCRIPT_LIBRARY_DIRECTORY = path.dirname(ts.getDefaultLibFilePath({}));

function usage() {
	return `Usage:
  node scripts/react-port/evidence.mjs init --batch <id> --node <pkg:id> --category <kind> [...]
  node scripts/react-port/evidence.mjs record --batch <id> --node <pkg:id> --gate <id> --status <status> [evidence]
  node scripts/react-port/evidence.mjs run --batch <id> --node <pkg:id> --gate <id> [--gate <id> ...] -- <approved-gate-command>
  node scripts/react-port/evidence.mjs verify --batch <id> --node <pkg:id> --package-dir <path> \
    --expected-directory <repo-path> --registrations <json> --crosswalk <json> --closure <json>

Common options:
  --work-root <directory>  Batch root (default: .react-port-work)
  --recover-stale-lock     Explicitly recover a lock older than 30 minutes

Use run for command-backed passed/failed evidence; commands execute directly
without a shell after validation against the requested gate. Record accepts
blocked rows with --reason and --repair, or inapplicable rows with --reason.
Automated gates are computed by verify.
`;
}

function parseArguments(arguments_) {
	if (arguments_[0] === '--') arguments_ = arguments_.slice(1);
	const separatorIndex = arguments_.indexOf('--');
	const optionArguments = separatorIndex === -1 ? arguments_ : arguments_.slice(0, separatorIndex);
	const commandArguments = separatorIndex === -1 ? [] : arguments_.slice(separatorIndex + 1);
	const command = optionArguments[0];
	if (!['init', 'record', 'run', 'verify'].includes(command))
		throw new Error('Expected init, record, run, or verify');
	const options = {
		category: [],
		gate: [],
		workRoot: path.join(process.cwd(), '.react-port-work'),
	};
	for (let index = 1; index < optionArguments.length; index += 1) {
		const argument = optionArguments[index];
		if (argument === '--recover-stale-lock') {
			options.recoverStaleLock = true;
			continue;
		}
		if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
		const name = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
		const value = optionArguments[index + 1];
		if (!value) throw new Error(`${argument} requires a value`);
		if (name === 'category' || name === 'gate') options[name].push(value);
		else if (name === 'workRoot') options.workRoot = path.resolve(value);
		else options[name] = value;
		index += 1;
	}
	if (!options.batch || !/^[a-z0-9][a-z0-9._-]*$/i.test(options.batch)) {
		throw new Error('--batch requires a path-safe identifier');
	}
	if (!options.node || !/^pkg:[@a-z0-9][@a-z0-9._/-]*$/i.test(options.node)) {
		throw new Error('--node requires a pkg:<package-name> graph id');
	}
	if (command !== 'run' && commandArguments.length > 0) {
		throw new Error('Only run accepts command arguments after --');
	}
	return { command, options, commandArguments };
}

function readJson(filePath, label) {
	try {
		return JSON.parse(readFileSync(path.resolve(filePath), 'utf8'));
	} catch (error) {
		throw new Error(
			`${label} is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function canonicalPath(filePath) {
	let existingPath = path.resolve(filePath);
	const missingParts = [];
	while (!existsSync(existingPath)) {
		const parent = path.dirname(existingPath);
		if (parent === existingPath) break;
		missingParts.unshift(path.basename(existingPath));
		existingPath = parent;
	}
	return path.join(realpathSync(existingPath), ...missingParts);
}

function attributionHashes(node) {
	const verdicts = [node.license?.published, node.license?.source];
	return {
		licenses: [
			...new Set(verdicts.flatMap((verdict) => verdict?.evidence ?? []).map((item) => item.sha256)),
		]
			.filter(Boolean)
			.sort(),
		notices: [
			...new Set(verdicts.flatMap((verdict) => verdict?.notices ?? []).map((item) => item.sha256)),
		]
			.filter(Boolean)
			.sort(),
	};
}

function setAutomatedGate(matrix, gateId, report, { artifact, passedObserved, repair }) {
	if (report.status === 'passed') {
		recordEvidence(matrix, gateId, {
			status: 'passed',
			artifact,
			observed: passedObserved,
		});
	} else {
		recordEvidence(matrix, gateId, {
			status: 'blocked',
			reason: report.issues?.join('\n') || `${gateId} did not pass`,
			repair,
		});
	}
}

function commandTimeout(options) {
	if (options.timeoutMs === undefined) return DEFAULT_COMMAND_TIMEOUT_MS;
	const timeout = Number(options.timeoutMs);
	if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > MAX_COMMAND_TIMEOUT_MS) {
		throw new Error(`--timeout-ms must be an integer from 1 to ${MAX_COMMAND_TIMEOUT_MS}`);
	}
	return timeout;
}

function commandObservation(stdout, stderr, fallback, credentialValues) {
	const output = [stdout, stderr].filter(Boolean).join('\n').trim();
	return sanitizeForReport(output || fallback, '', credentialValues);
}

function isExactCommand(commandArguments, expected) {
	return JSON.stringify(commandArguments) === JSON.stringify(expected);
}

function hasTypeProjectMarker(relativeProject, marker) {
	return new RegExp(`(?:^|[./_-])${marker}(?:[./_-]|$)`, 'i').test(relativeProject);
}

function isTypeProjectCommand(commandArguments, bindingDirectory, gateId, compiler) {
	if (
		commandArguments.length !== 6 ||
		!isExactCommand(commandArguments.slice(0, 5), ['pnpm', 'exec', compiler, '--noEmit', '-p'])
	) {
		return false;
	}
	const projectPath = commandArguments[5].replaceAll('\\', '/').replace(/^\.\//, '');
	if (!projectPath.startsWith(`${bindingDirectory}/`) || !projectPath.endsWith('.json')) {
		return false;
	}
	const relativeProject = projectPath.slice(`${bindingDirectory}/`.length);
	if (
		!relativeProject ||
		relativeProject.split('/').some((segment) => !segment || segment === '.' || segment === '..')
	) {
		return false;
	}
	if (gateId === 'authored-source-types') return relativeProject === 'tsconfig.json';
	if (gateId === 'upstream-types-pristine') {
		return hasTypeProjectMarker(relativeProject, 'pristine');
	}
	if (gateId === 'upstream-types-adapted') {
		return hasTypeProjectMarker(relativeProject, 'adapted');
	}
	return (
		relativeProject === 'tests/types/tsconfig.json' ||
		hasTypeProjectMarker(relativeProject, 'public')
	);
}

function bindingPackageDirectory(node, workspaceRoot) {
	const packageDirectory = path.resolve(workspaceRoot, node.bindingDirectory);
	const relative = path.relative(path.resolve(workspaceRoot), packageDirectory);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error('Graph-planned binding directory escapes the workspace');
	}
	return packageDirectory;
}

function packageTestInvocations(manifest, scriptName = 'test', visiting = new Set()) {
	if (visiting.has(scriptName)) return [];
	const script = manifest.scripts?.[scriptName]?.trim();
	if (!script) return [];
	const nextVisiting = new Set(visiting).add(scriptName);
	const segments = script
		.split(/&&|\|\||;/)
		.map((segment) => segment.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)+/, ''));
	const invocations = [];
	for (const segment of segments) {
		const direct = segment.match(/^(?:(?:pnpm\s+(?:exec\s+)?)?)(vitest|jest)(?:\s+(.*))?$/);
		if (direct) {
			const [, runner, rawArguments = ''] = direct;
			if (
				!/--(?:version|help|listTests|showConfig)\b|(?:^|\s)(?:list|--watch)(?:\s|$)/.test(
					rawArguments,
				) &&
				(runner !== 'vitest' || /(?:^|\s)(?:run|--run)(?:\s|$)/.test(rawArguments))
			) {
				invocations.push({ runner, segment });
			}
			continue;
		}
		const nodeCommand = segment.match(/^node(?:\s+(.*))?$/);
		const nodeArguments = (nodeCommand?.[1] ?? '')
			.split(/\s+/)
			.map((argument) => argument.replace(/^['"]|['"]$/g, ''))
			.filter(Boolean);
		if (nodeCommand && isNodeTestInvocation(nodeArguments)) {
			const runtimeOptionBoundary = nodeRuntimeOptionBoundary(nodeArguments);
			if (
				runtimeOptionBoundary !== null &&
				!nodeArguments
					.slice(0, runtimeOptionBoundary)
					.some((argument) => /^--(?:test-name-pattern|test-only|watch)(?:=|$)/.test(argument))
			) {
				const selectors = nodeArguments
					.slice(runtimeOptionBoundary)
					.filter(
						(argument) =>
							!argument.startsWith('-') &&
							(/[?*/]/.test(argument) || /\.(?:[cm]?[jt]sx?|tsrx)$/i.test(argument)),
					);
				invocations.push({ runner: 'node-test', segment, selectors });
			}
			continue;
		}
		if (
			/^node\s+(?:(?:\.\.\/)+)?scripts\/react-parity\/harness\.mjs\s+run-required(?:\s|$)/.test(
				segment,
			)
		) {
			invocations.push({ runner: 'react-parity', segment });
			continue;
		}
		const delegated = segment.match(/^pnpm\s+(?:run\s+)?([^\s]+)$/)?.[1];
		if (delegated) {
			invocations.push(...packageTestInvocations(manifest, delegated, nextVisiting));
		}
	}
	return invocations;
}

function selectedNodeTestFiles(packageDirectory, testFiles, selectors) {
	const packageRoot = realpathSync(packageDirectory);
	const selected = new Set();
	for (const selector of selectors) {
		for (const testFile of testFiles) {
			const relative = path.relative(packageRoot, testFile).replaceAll('\\', '/');
			if (globMatches(relative, selector)) selected.add(testFile);
		}
		if (!/[?*]/.test(selector)) {
			const selectedPath = path.resolve(packageRoot, selector);
			if (existsSync(selectedPath)) selected.add(realpathSync(selectedPath));
		}
	}
	return [...selected].sort();
}

function packageTestExecutionPlan(node, workspaceRoot) {
	const packageDirectory = bindingPackageDirectory(node, workspaceRoot);
	const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
	const invocations = packageTestInvocations(manifest);
	const runners = invocations.map(({ runner }) => runner);
	if (runners.length === 0) {
		throw new Error(
			'Package test script must run Vitest, Jest, node --test, or the repository parity command',
		);
	}
	const testFiles = discoverPackageTests(packageDirectory).map((filePath) =>
		realpathSync(filePath),
	);
	const reportEligibleTestFiles = discoverReportEligiblePackageTests(packageDirectory).map(
		(filePath) => realpathSync(filePath),
	);
	if (testFiles.length === 0) {
		throw new Error('Package test gate has no package-local test file candidates');
	}
	const nodeInvocations = invocations.filter(({ runner }) => runner === 'node-test');
	if (nodeInvocations.length > 1 || (nodeInvocations.length === 1 && runners.length > 1)) {
		const packageRoot = realpathSync(packageDirectory);
		const selectedByInvocation = nodeInvocations.map(({ selectors }) =>
			selectedNodeTestFiles(packageDirectory, testFiles, selectors),
		);
		if (selectedByInvocation.some((files) => files.length === 0)) {
			throw new Error(
				'Mixed or multiple Node test invocations must select explicit existing test files',
			);
		}
		const selectedCounts = new Map();
		for (const files of selectedByInvocation) {
			for (const filePath of files) {
				selectedCounts.set(filePath, (selectedCounts.get(filePath) ?? 0) + 1);
			}
		}
		const duplicated = [...selectedCounts]
			.filter(([, count]) => count > 1)
			.map(([filePath]) => path.relative(packageRoot, filePath));
		const nodeOwnedFiles = testFiles.filter(
			(filePath) =>
				isConventionalPackageTestFile(filePath) &&
				/\b(?:from\s+|require\s*\()['"]node:test['"]/.test(readFileSync(filePath, 'utf8')),
		);
		const omitted = nodeOwnedFiles
			.filter((filePath) => !selectedCounts.has(filePath))
			.map((filePath) => path.relative(packageRoot, filePath));
		if (duplicated.length > 0 || omitted.length > 0) {
			throw new Error(
				`Multiple Node test invocations do not prove distinct complete test-file identities (duplicated: ${duplicated.join(', ') || 'none'}; omitted: ${omitted.join(', ') || 'none'})`,
			);
		}
	}
	return {
		invocations,
		packageDirectory,
		reportEligibleTestFiles,
		runners,
	};
}

function runnerCounts(runners) {
	const counts = new Map();
	for (const runner of runners) counts.set(runner, (counts.get(runner) ?? 0) + 1);
	return counts;
}

function assertPackageTestReport(plan, reportDirectory) {
	if (plan.runners.every((runner) => runner === 'react-parity')) return;
	const expectedRunners = plan.runners.filter((runner) => runner !== 'react-parity');
	const invocationPaths = readdirSync(reportDirectory)
		.filter((name) => name.endsWith('.invocation.json'))
		.map((name) => path.join(reportDirectory, name));
	if (invocationPaths.length !== expectedRunners.length) {
		throw new Error(
			`Package test runner created ${invocationPaths.length} machine-readable invocation record(s) for ${expectedRunners.length} required test-runner invocation(s)`,
		);
	}
	const invocations = invocationPaths.map((invocationPath) =>
		readJson(invocationPath, 'package test invocation'),
	);
	const expectedCounts = runnerCounts(expectedRunners);
	const actualCounts = runnerCounts(invocations.map(({ runner }) => runner));
	for (const runner of new Set([...expectedCounts.keys(), ...actualCounts.keys()])) {
		if ((expectedCounts.get(runner) ?? 0) !== (actualCounts.get(runner) ?? 0)) {
			throw new Error(
				`Package test runner invocation mismatch for ${runner}: expected ${expectedCounts.get(runner) ?? 0}, observed ${actualCounts.get(runner) ?? 0}`,
			);
		}
	}

	const invocationIds = new Set();
	const reportFiles = new Set();
	const reports = invocations.map((invocation) => {
		if (
			invocation.schemaVersion !== 1 ||
			typeof invocation.invocationId !== 'string' ||
			invocationIds.has(invocation.invocationId) ||
			!Array.isArray(invocation.argv) ||
			typeof invocation.reportFile !== 'string' ||
			path.basename(invocation.reportFile) !== invocation.reportFile ||
			reportFiles.has(invocation.reportFile)
		) {
			throw new Error('Package test runner emitted invalid or duplicate invocation evidence');
		}
		if (invocation.runner === 'node-test' && invocation.status !== 0) {
			throw new Error('Package Node test invocation did not complete successfully');
		}
		invocationIds.add(invocation.invocationId);
		reportFiles.add(invocation.reportFile);
		const reportPath = path.join(reportDirectory, invocation.reportFile);
		if (!existsSync(reportPath)) {
			throw new Error(
				`Package ${invocation.runner} invocation completed without its runner report: ${JSON.stringify(invocation.argv)}`,
			);
		}
		return readJson(reportPath, `package ${invocation.runner} test report`);
	});

	let executedPassingTests = 0;
	const packageDirectory = canonicalPath(plan.packageDirectory);
	const reportEligibleTestFiles = new Set(plan.reportEligibleTestFiles);
	for (const [index, report] of reports.entries()) {
		const passed = Number(report.numPassedTests ?? 0);
		const failed = Number(report.numFailedTests ?? 0);
		const skipped = Number(report.numPendingTests ?? 0) + Number(report.numTodoTests ?? 0);
		if (passed === 0 || failed !== 0 || skipped !== 0) {
			throw new Error(
				`Package ${invocations[index].runner} test report does not contain a complete passing registration set`,
			);
		}
		const reportedFiles = new Set(
			(report.testResults ?? [])
				.map((result) => result.name ?? result.testFilePath)
				.filter((filePath) => typeof filePath === 'string')
				.map((filePath) => canonicalPath(path.resolve(plan.packageDirectory, filePath))),
		);
		const packageFiles = [...reportedFiles].filter((filePath) => {
			const relative = path.relative(packageDirectory, filePath);
			return !relative.startsWith('..') && !path.isAbsolute(relative);
		});
		if (packageFiles.length === 0) {
			throw new Error(
				`Package ${invocations[index].runner} test report names no executed test file inside the binding package`,
			);
		}
		const unexpectedFiles = packageFiles.filter(
			(filePath) => !reportEligibleTestFiles.has(filePath),
		);
		if (unexpectedFiles.length > 0) {
			throw new Error(
				`Package test report names a non-test package file: ${unexpectedFiles
					.map((filePath) => path.relative(packageDirectory, filePath))
					.join(', ')}`,
			);
		}
		executedPassingTests += passed;
	}

	if (executedPassingTests === 0) {
		throw new Error('Package test runners produced no machine-verifiable passing tests');
	}
}

function createNodeCommandProxy() {
	const proxyDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-node-proxy-'));
	const wrapper = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'node-test-invocation-wrapper.mjs',
	);
	const shellProxy = path.join(proxyDirectory, 'node');
	const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
	writeFileSync(
		shellProxy,
		`#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(wrapper)} "$@"\n`,
	);
	chmodSync(shellProxy, 0o755);
	writeFileSync(
		path.join(proxyDirectory, 'node.cmd'),
		`@echo off\r\n"${process.execPath.replaceAll('%', '%%')}" "${wrapper.replaceAll('%', '%%')}" %*\r\n`,
	);
	return proxyDirectory;
}

function instrumentPackageTestCommand(commandArguments, plan) {
	if (
		!plan?.runners.includes('node-test') ||
		!isNodeTestInvocation(commandArguments.slice(1)) ||
		!existsSync(commandArguments[0]) ||
		canonicalPath(commandArguments[0]) !== canonicalPath(process.execPath)
	) {
		return commandArguments;
	}
	return [
		process.execPath,
		path.join(path.dirname(fileURLToPath(import.meta.url)), 'node-test-invocation-wrapper.mjs'),
		...commandArguments.slice(1),
	];
}

function assertPackageTestSemantics(node, workspaceRoot) {
	const packageDirectory = bindingPackageDirectory(node, workspaceRoot);
	const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
	const testScript = manifest.scripts?.test?.trim();
	if (
		!testScript ||
		/^(?:true|:|exit\s+0|echo(?:\s+.*)?|node\s+(?:--eval|-e)\s+['"]?(?:true|process\.exit\(0\))['"]?)$/i.test(
			testScript,
		)
	) {
		throw new Error('Package test script is missing or is a no-op');
	}
	return packageTestExecutionPlan(node, workspaceRoot);
}

function authoredSourceFiles(packageDirectory) {
	const sourceDirectory = path.join(packageDirectory, 'src');
	if (!existsSync(sourceDirectory)) return [];
	const files = [];
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(entryPath);
			else if (entry.isFile() && /(?:\.d)?\.(?:[cm]?ts|tsx|tsrx)$/i.test(entry.name)) {
				files.push(path.resolve(entryPath));
			}
		}
	};
	walk(sourceDirectory);
	return files.sort();
}

function globMatches(relativePath, spec) {
	const normalized = spec.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
	if (!/[?*]/.test(normalized)) {
		return relativePath === normalized || relativePath.startsWith(`${normalized}/`);
	}
	let expression = '^';
	for (let index = 0; index < normalized.length; index++) {
		const character = normalized[index];
		if (character === '*' && normalized[index + 1] === '*') {
			if (normalized[index + 2] === '/') {
				expression += '(?:.*/)?';
				index += 2;
			} else {
				expression += '.*';
				index++;
			}
		} else if (character === '*') expression += '[^/]*';
		else if (character === '?') expression += '[^/]';
		else expression += character.replace(/[\\^$.[\]{}()+|]/g, '\\$&');
	}
	return new RegExp(`${expression}$`).test(relativePath);
}

function configSelectsCustomSource(config, projectDirectory, sourcePath) {
	const relativePath = path.relative(projectDirectory, sourcePath).replaceAll('\\', '/');
	const files = Array.isArray(config.files) ? config.files : null;
	if (files) return files.some((spec) => globMatches(relativePath, String(spec)));
	const includes = Array.isArray(config.include) ? config.include : ['**/*'];
	const excludes = Array.isArray(config.exclude) ? config.exclude : [];
	return (
		includes.some((spec) => globMatches(relativePath, String(spec))) &&
		!excludes.some((spec) => globMatches(relativePath, String(spec)))
	);
}

function scriptKind(filePath) {
	if (/\.(?:tsx|tsrx)$/i.test(filePath)) return ts.ScriptKind.TSX;
	if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
	if (/\.(?:js|mjs|cjs)$/i.test(filePath)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function bindingSymbols(name, checker, output) {
	if (ts.isIdentifier(name)) {
		const symbol = checker.getSymbolAtLocation(name);
		if (symbol) output.add(symbol);
	} else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
		for (const element of name.elements) {
			if (ts.isBindingElement(element)) bindingSymbols(element.name, checker, output);
		}
	}
}

function referencesSymbols(node, checker, symbols) {
	let found = false;
	const visit = (child) => {
		if (ts.isIdentifier(child) && symbols.has(checker.getSymbolAtLocation(child))) found = true;
		if (!found) ts.forEachChild(child, visit);
	};
	visit(node);
	return found;
}

function referencedProvenance(node, checker, provenanceBySymbol) {
	const keys = new Set();
	const visit = (child) => {
		if (ts.isIdentifier(child)) {
			for (const key of provenanceBySymbol.get(checker.getSymbolAtLocation(child)) ?? []) {
				keys.add(key);
			}
		}
		ts.forEachChild(child, visit);
	};
	visit(node);
	return keys;
}

function typeContainsUnsafe(type, checker, seen = new Set()) {
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
	if (seen.has(type)) return false;
	seen.add(type);
	if (type.flags & ts.TypeFlags.TypeParameter) {
		for (const parameterType of [
			checker.getBaseConstraintOfType(type),
			checker.getDefaultFromTypeParameter(type),
		]) {
			if (parameterType && typeContainsUnsafe(parameterType, checker, seen)) return true;
		}
	}
	if (type.isUnionOrIntersection?.()) {
		return type.types.some((nested) => typeContainsUnsafe(nested, checker, seen));
	}
	for (const signature of [
		...checker.getSignaturesOfType(type, ts.SignatureKind.Call),
		...checker.getSignaturesOfType(type, ts.SignatureKind.Construct),
	]) {
		for (const typeParameter of signature.getTypeParameters() ?? []) {
			if (typeContainsUnsafe(typeParameter, checker, seen)) return true;
		}
		if (typeContainsUnsafe(checker.getReturnTypeOfSignature(signature), checker, seen)) return true;
		for (const parameter of signature.parameters) {
			const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
			if (!declaration) continue;
			const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
			// Classifiers can safely accept an arbitrary value without erasing their
			// return contract. Only a direct unknown parameter has that meaning;
			// any, nested unknown shapes, and unknown returns still fail below.
			if (parameterType.flags & ts.TypeFlags.Unknown) continue;
			if (typeContainsUnsafe(parameterType, checker, seen)) return true;
		}
	}
	if (type.flags & ts.TypeFlags.Object) {
		if (type.objectFlags & (ts.ObjectFlags.Class | ts.ObjectFlags.Interface)) {
			for (const baseType of checker.getBaseTypes(type)) {
				if (typeContainsUnsafe(baseType, checker, seen)) return true;
			}
		}
		if (type.objectFlags & ts.ObjectFlags.Reference) {
			for (const argument of checker.getTypeArguments(type)) {
				if (typeContainsUnsafe(argument, checker, seen)) return true;
			}
		}
		for (const property of checker.getPropertiesOfType(type)) {
			const declarations = property.declarations ?? [];
			const authoredDeclaration = declarations.find(
				(declaration) => !declaration.getSourceFile().hasNoDefaultLib,
			);
			if (!authoredDeclaration && declarations.length > 0) continue;
			const declaration = authoredDeclaration ?? property.valueDeclaration;
			if (
				declaration &&
				typeContainsUnsafe(checker.getTypeOfSymbolAtLocation(property, declaration), checker, seen)
			) {
				return true;
			}
		}
		for (const indexInfo of checker.getIndexInfosOfType(type)) {
			if (typeContainsUnsafe(indexInfo.type, checker, seen)) return true;
		}
	}
	return false;
}

function declarationsContainUnsafeTypeParameters(symbol, checker) {
	for (const declaration of symbol.declarations ?? []) {
		for (const typeParameter of declaration.typeParameters ?? []) {
			for (const typeNode of [typeParameter.constraint, typeParameter.default]) {
				if (typeNode && typeContainsUnsafe(checker.getTypeFromTypeNode(typeNode), checker)) {
					return true;
				}
			}
		}
	}
	return false;
}

function assertionRootIdentifier(expression) {
	if (ts.isIdentifier(expression)) return expression;
	if (ts.isPropertyAccessExpression(expression)) {
		return assertionRootIdentifier(expression.expression);
	}
	if (ts.isCallExpression(expression)) return assertionRootIdentifier(expression.expression);
	return null;
}

function directBindingExpressionProvenance(expression, checker, provenanceBySymbol) {
	const provenance = new Set();
	const visit = (node) => {
		if (ts.isIdentifier(node)) {
			if (!identifierIsImportBinding(node, checker)) return false;
			for (const key of referencedProvenance(node, checker, provenanceBySymbol)) {
				provenance.add(key);
			}
			return true;
		}
		if (ts.isPropertyAccessExpression(node)) {
			if (!visit(node.expression)) return false;
			for (const key of referencedProvenance(node.name, checker, provenanceBySymbol)) {
				provenance.add(key);
			}
			return true;
		}
		if (ts.isCallExpression(node)) return visit(node.expression);
		if (ts.isParenthesizedExpression(node)) return visit(node.expression);
		return false;
	};
	return visit(expression) && provenance.size > 0 ? provenance : null;
}

function resolvedSymbolAtLocation(node, checker) {
	let symbol = checker.getSymbolAtLocation(node);
	while (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	return symbol;
}

function identifierIsImportBinding(identifier, checker) {
	return Boolean(
		checker
			.getSymbolAtLocation(identifier)
			?.declarations?.some(
				(declaration) =>
					ts.isImportClause(declaration) ||
					ts.isImportSpecifier(declaration) ||
					ts.isNamespaceImport(declaration),
			),
	);
}

function typeQueryRootIdentifier(name) {
	return ts.isIdentifier(name) ? name : typeQueryRootIdentifier(name.left);
}

function isTypeScriptLibrarySymbol(symbol) {
	return symbol?.declarations?.some((declaration) => {
		const declarationPath = canonicalPath(declaration.getSourceFile().fileName);
		const relative = path.relative(TYPESCRIPT_LIBRARY_DIRECTORY, declarationPath);
		return !relative.startsWith('..') && !path.isAbsolute(relative);
	});
}

function typeParameterAffectsDeclaration(symbol, parameterIndex, checker) {
	return symbol?.declarations?.some((declaration) => {
		const parameter = declaration.typeParameters?.[parameterIndex];
		const parameterSymbol = parameter && checker.getSymbolAtLocation(parameter.name);
		if (!parameterSymbol) return false;
		let affectsDeclaration = false;
		const visit = (node) => {
			if (affectsDeclaration) return;
			if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === parameterSymbol) {
				affectsDeclaration = true;
				return;
			}
			ts.forEachChild(node, visit);
		};
		if (ts.isTypeAliasDeclaration(declaration)) visit(declaration.type);
		else {
			for (const member of declaration.members ?? []) visit(member);
			for (const clause of declaration.heritageClauses ?? []) visit(clause);
		}
		return affectsDeclaration;
	});
}

const DIRECT_TYPESCRIPT_ALIAS_PROJECTIONS = new Set([
	'Awaited',
	'Capitalize',
	'ConstructorParameters',
	'InstanceType',
	'Lowercase',
	'NoInfer',
	'NonNullable',
	'OmitThisParameter',
	'Parameters',
	'Partial',
	'Readonly',
	'Required',
	'ReturnType',
	'ThisParameterType',
	'Uncapitalize',
	'Uppercase',
]);

function typeNodeHasFlags(node, checker, flags) {
	return Boolean(checker.getTypeFromTypeNode(node).flags & flags);
}

function typeProjectionHasObservableStructure(node, checker) {
	const result = checker.getTypeFromTypeNode(node);
	return (
		checker.getPropertiesOfType(result).length > 0 ||
		checker.getSignaturesOfType(result, ts.SignatureKind.Call).length > 0 ||
		checker.getSignaturesOfType(result, ts.SignatureKind.Construct).length > 0 ||
		checker.getIndexInfosOfType(result).length > 0
	);
}

function typeAliasProjectionPreservesArgument(name, node, argumentIndex, checker) {
	if (DIRECT_TYPESCRIPT_ALIAS_PROJECTIONS.has(name)) return argumentIndex === 0;
	const arguments_ = node.typeArguments ?? [];
	switch (name) {
		case 'Omit':
			return (
				argumentIndex === 0 &&
				arguments_.length === 2 &&
				typeProjectionHasObservableStructure(node, checker)
			);
		case 'Pick':
			return (
				argumentIndex === 0 &&
				arguments_.length === 2 &&
				!typeNodeHasFlags(
					arguments_[1],
					checker,
					ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never,
				)
			);
		case 'Record':
			return (
				argumentIndex === 1 &&
				arguments_.length === 2 &&
				!typeNodeHasFlags(
					arguments_[0],
					checker,
					ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never,
				)
			);
		default:
			return false;
	}
}

function directBindingDerivedTypeProvenance(node, checker, provenanceBySymbol) {
	let containsConditionalProof = false;
	const inspect = (child) => {
		if (ts.isConditionalTypeNode(child)) {
			containsConditionalProof = true;
			return;
		}
		ts.forEachChild(child, inspect);
	};
	inspect(node);
	if (containsConditionalProof) return null;
	if (ts.isParenthesizedTypeNode(node)) {
		return directBindingDerivedTypeProvenance(node.type, checker, provenanceBySymbol);
	}
	if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword) {
		return directBindingDerivedTypeProvenance(node.type, checker, provenanceBySymbol);
	}
	if (ts.isIndexedAccessTypeNode(node)) {
		const index = checker.getTypeFromTypeNode(node.indexType);
		if (index.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return null;
		if (referencedProvenance(node.indexType, checker, provenanceBySymbol).size > 0) return null;
		return directBindingDerivedTypeProvenance(node.objectType, checker, provenanceBySymbol);
	}
	if (ts.isTypeQueryNode(node)) {
		if (!identifierIsImportBinding(typeQueryRootIdentifier(node.exprName), checker)) return null;
		const provenance = referencedProvenance(node.exprName, checker, provenanceBySymbol);
		return provenance.size > 0 ? provenance : null;
	}
	if (!ts.isTypeReferenceNode(node)) return null;
	const directProvenance = referencedProvenance(node.typeName, checker, provenanceBySymbol);
	if (
		directProvenance.size > 0 &&
		identifierIsImportBinding(typeQueryRootIdentifier(node.typeName), checker)
	) {
		return directProvenance;
	}
	const wrapper = resolvedSymbolAtLocation(node.typeName, checker);
	if (!isTypeScriptLibrarySymbol(wrapper)) return null;
	const provenance = new Set();
	const wrapperIsTypeAlias = wrapper.declarations?.some(ts.isTypeAliasDeclaration);
	for (const [index, argument] of (node.typeArguments ?? []).entries()) {
		const argumentProvenance = directBindingDerivedTypeProvenance(
			argument,
			checker,
			provenanceBySymbol,
		);
		if (
			argumentProvenance &&
			!(wrapperIsTypeAlias
				? typeAliasProjectionPreservesArgument(wrapper.getName(), node, index, checker)
				: typeParameterAffectsDeclaration(wrapper, index, checker))
		) {
			return null;
		}
		for (const key of argumentProvenance ?? []) {
			provenance.add(key);
		}
	}
	return provenance.size > 0 ? provenance : null;
}

function constrainedTypeAliasProvenance(
	node,
	checker,
	provenanceBySymbol,
	trustedTypeAliasSymbols,
) {
	if (!ts.isTypeReferenceNode(node.type)) return null;
	if (!trustedTypeAliasSymbols.Assert?.has(resolvedSymbolAtLocation(node.type.typeName, checker))) {
		return null;
	}
	if (node.type.typeArguments?.length !== 1) return null;
	const proof = node.type.typeArguments[0];
	if (
		!ts.isTypeReferenceNode(proof) ||
		!trustedTypeAliasSymbols.Equal?.has(resolvedSymbolAtLocation(proof.typeName, checker))
	) {
		return null;
	}
	if (proof.typeArguments?.length !== 2) return null;
	const result = checker.getTypeFromTypeNode(node.type);
	if (!(result.flags & ts.TypeFlags.BooleanLiteral) || result.intrinsicName !== 'true') return null;
	const leftProvenance = referencedProvenance(proof.typeArguments[0], checker, provenanceBySymbol);
	const rightProvenance = referencedProvenance(proof.typeArguments[1], checker, provenanceBySymbol);
	const leftHasProvenance = leftProvenance.size > 0;
	const rightHasProvenance = rightProvenance.size > 0;
	if (leftHasProvenance === rightHasProvenance) return null;
	return directBindingDerivedTypeProvenance(
		leftHasProvenance ? proof.typeArguments[0] : proof.typeArguments[1],
		checker,
		provenanceBySymbol,
	);
}

function positiveAssertionProvenance(
	node,
	checker,
	provenanceBySymbol,
	trustedAssertionSymbols,
	trustedTypeAliasSymbols,
) {
	const provenance = referencedProvenance(node, checker, provenanceBySymbol);
	if (provenance.size === 0) return null;
	if (ts.isSatisfiesExpression(node)) {
		const constraint = checker.getTypeFromTypeNode(node.type);
		const emptyObjectConstraint = ts.isTypeLiteralNode(node.type) && node.type.members.length === 0;
		const constraintProvenance = referencedProvenance(node.type, checker, provenanceBySymbol);
		const expressionProvenance = directBindingExpressionProvenance(
			node.expression,
			checker,
			provenanceBySymbol,
		);
		return constraint.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) ||
			emptyObjectConstraint ||
			constraintProvenance.size > 0 ||
			!expressionProvenance
			? null
			: expressionProvenance;
	}
	if (ts.isTypeAliasDeclaration(node)) {
		return constrainedTypeAliasProvenance(
			node,
			checker,
			provenanceBySymbol,
			trustedTypeAliasSymbols,
		);
	}
	if (ts.isCallExpression(node)) {
		const root = assertionRootIdentifier(node.expression);
		const rootSymbol = root && checker.getSymbolAtLocation(root);
		if (!rootSymbol || !trustedAssertionSymbols.has(rootSymbol)) return null;
		if (
			node.typeArguments?.some((argument) =>
				typeContainsUnsafe(checker.getTypeFromTypeNode(argument), checker),
			)
		) {
			return null;
		}
		if (root.text === 'expectType') {
			return node.typeArguments?.length && node.arguments.length ? provenance : null;
		}
		return ts.isPropertyAccessExpression(node.expression) ? provenance : null;
	}
	return null;
}

function collectPositiveAssertionProvenance(
	node,
	checker,
	provenanceBySymbol,
	trustedAssertionSymbols,
	trustedTypeAliasSymbols,
) {
	const asserted = new Set();
	const visit = (child) => {
		const provenance = positiveAssertionProvenance(
			child,
			checker,
			provenanceBySymbol,
			trustedAssertionSymbols,
			trustedTypeAliasSymbols,
		);
		if (provenance) {
			for (const key of provenance) asserted.add(key);
		}
		ts.forEachChild(child, visit);
	};
	visit(node);
	return asserted;
}

function analyzeTypeEvidence(
	programFiles,
	parsed,
	expectedSpecifiers,
	trustedTypeAssertionModulePath,
) {
	const checkerFiles = programFiles.filter((filePath) => !filePath.endsWith('.tsrx'));
	const program = ts.createProgram({ rootNames: checkerFiles, options: parsed.options });
	const checker = program.getTypeChecker();
	const expected = new Set(expectedSpecifiers);
	const importedEntries = new Set();
	const importedBindings = [];
	const fileEvidence = new Map();
	const projectImportsBySpecifier = new Map();
	const provenanceBySymbol = new Map();
	const publicExports = new Map();
	const trustedAssertionSymbols = new Set();
	const trustedTypeAliasSymbols = { Assert: new Set(), Equal: new Set() };
	const addProvenance = (symbol, key) => {
		if (!symbol) return;
		const provenance = provenanceBySymbol.get(symbol) ?? new Set();
		provenance.add(key);
		provenanceBySymbol.set(symbol, provenance);
	};

	for (const filePath of checkerFiles) {
		const source = readFileSync(filePath, 'utf8');
		const sourceFile =
			program.getSourceFile(filePath) ??
			ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind(filePath));
		const taintedSymbols = new Set();
		for (const statement of sourceFile.statements) {
			if (
				ts.isImportDeclaration(statement) &&
				statement.importClause?.namedBindings &&
				ts.isNamedImports(statement.importClause.namedBindings)
			) {
				for (const element of statement.importClause.namedBindings.elements) {
					const symbol = resolvedSymbolAtLocation(element.name, checker);
					const exportName = element.propertyName?.text ?? element.name.text;
					if (
						symbol &&
						Object.hasOwn(trustedTypeAliasSymbols, exportName) &&
						symbol.declarations?.some(
							(declaration) =>
								canonicalPath(declaration.getSourceFile().fileName) ===
								trustedTypeAssertionModulePath,
						)
					) {
						trustedTypeAliasSymbols[exportName].add(symbol);
					}
				}
			}
			if (
				ts.isImportDeclaration(statement) &&
				ts.isStringLiteral(statement.moduleSpecifier) &&
				['vitest', 'expect-type', 'tsd'].includes(statement.moduleSpecifier.text) &&
				statement.importClause?.namedBindings &&
				ts.isNamedImports(statement.importClause.namedBindings)
			) {
				for (const element of statement.importClause.namedBindings.elements) {
					if (
						['expectType', 'expectTypeOf'].includes(element.propertyName?.text ?? element.name.text)
					) {
						const symbol = checker.getSymbolAtLocation(element.name);
						if (symbol) trustedAssertionSymbols.add(symbol);
					}
				}
			}
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				!expected.has(statement.moduleSpecifier.text)
			) {
				continue;
			}
			const specifier = statement.moduleSpecifier.text;
			importedEntries.add(specifier);
			const record = projectImportsBySpecifier.get(specifier) ?? {
				moduleSpecifier: statement.moduleSpecifier,
				namespace: false,
				coveredExports: new Set(),
			};
			const clause = statement.importClause;
			if (clause?.name) {
				bindingSymbols(clause.name, checker, taintedSymbols);
				record.coveredExports.add('default');
				importedBindings.push(clause.name);
				addProvenance(checker.getSymbolAtLocation(clause.name), `${specifier}:default`);
			}
			if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
				bindingSymbols(clause.namedBindings.name, checker, taintedSymbols);
				record.namespace = true;
				importedBindings.push(clause.namedBindings.name);
			}
			if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const element of clause.namedBindings.elements) {
					bindingSymbols(element.name, checker, taintedSymbols);
					const exportName = element.propertyName?.text ?? element.name.text;
					record.coveredExports.add(exportName);
					importedBindings.push(element.name);
					addProvenance(checker.getSymbolAtLocation(element.name), `${specifier}:${exportName}`);
				}
			}
			projectImportsBySpecifier.set(specifier, record);
		}
		fileEvidence.set(filePath, { source, sourceFile, taintedSymbols });
	}

	const missingEntries = [...expected].filter((specifier) => !importedEntries.has(specifier));
	if (missingEntries.length > 0) {
		throw new Error(`Type project omits public entry import(s): ${missingEntries.join(', ')}`);
	}
	for (const [specifier, record] of projectImportsBySpecifier) {
		const moduleSymbol = checker.getSymbolAtLocation(record.moduleSpecifier);
		if (!moduleSymbol) throw new Error(`Type project cannot resolve public entry ${specifier}`);
		const exports = checker.getExportsOfModule(moduleSymbol);
		if (!record.namespace) {
			const omitted = exports
				.map((symbol) => symbol.name)
				.filter((name) => !record.coveredExports.has(name));
			if (omitted.length > 0) {
				throw new Error(
					`Type project does not consume every export from ${specifier}: ${omitted.join(', ')}`,
				);
			}
		}
		for (const symbol of exports) {
			const exportKey = `${specifier}:${symbol.name}`;
			publicExports.set(exportKey, { name: symbol.name, specifier });
			addProvenance(symbol, exportKey);
			const declaration =
				symbol.valueDeclaration ?? symbol.declarations?.[0] ?? record.moduleSpecifier;
			let type;
			try {
				type =
					symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)
						? checker.getDeclaredTypeOfSymbol(symbol)
						: checker.getTypeOfSymbolAtLocation(symbol, declaration);
			} catch (error) {
				throw new Error(
					`Type project cannot inspect public export ${specifier}.${symbol.name}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			if (
				typeContainsUnsafe(type, checker) ||
				declarationsContainUnsafeTypeParameters(symbol, checker)
			) {
				throw new Error(
					`Imported public type ${specifier}.${symbol.name} resolves to any or unknown`,
				);
			}
		}
	}
	for (const imported of importedBindings) {
		if (checker.getTypeAtLocation(imported).flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
			throw new Error(`Imported public type ${imported.text} resolves to any or unknown`);
		}
	}

	for (const evidence of fileEvidence.values()) {
		let changed = true;
		while (changed) {
			changed = false;
			const visit = (node) => {
				if (
					ts.isVariableDeclaration(node) &&
					node.initializer &&
					referencesSymbols(node.initializer, checker, evidence.taintedSymbols)
				) {
					const before = evidence.taintedSymbols.size;
					bindingSymbols(node.name, checker, evidence.taintedSymbols);
					const provenance = referencedProvenance(node.initializer, checker, provenanceBySymbol);
					const bindings = new Set();
					bindingSymbols(node.name, checker, bindings);
					for (const symbol of bindings) {
						for (const key of provenance) addProvenance(symbol, key);
					}
					changed ||= evidence.taintedSymbols.size !== before;
				}
				if (
					ts.isTypeAliasDeclaration(node) &&
					referencesSymbols(node.type, checker, evidence.taintedSymbols)
				) {
					const before = evidence.taintedSymbols.size;
					bindingSymbols(node.name, checker, evidence.taintedSymbols);
					const provenance = referencedProvenance(node.type, checker, provenanceBySymbol);
					const symbol = checker.getSymbolAtLocation(node.name);
					for (const key of provenance) addProvenance(symbol, key);
					changed ||= evidence.taintedSymbols.size !== before;
				}
				ts.forEachChild(node, visit);
			};
			visit(evidence.sourceFile);
		}
	}

	let hasPositiveAssertion = false;
	let hasNegativeControl = false;
	const assertedExports = new Set();
	for (const evidence of fileEvidence.values()) {
		const inspect = (node) => {
			const asserted = positiveAssertionProvenance(
				node,
				checker,
				provenanceBySymbol,
				trustedAssertionSymbols,
				trustedTypeAliasSymbols,
			);
			if (asserted) {
				hasPositiveAssertion = true;
				for (const key of asserted) assertedExports.add(key);
			}
			if (ts.isStatement(node)) {
				const leading = evidence.source.slice(
					node.getFullStart(),
					node.getStart(evidence.sourceFile),
				);
				if (
					/@ts-expect-error\b/.test(leading) &&
					referencesSymbols(node, checker, evidence.taintedSymbols)
				) {
					hasNegativeControl = true;
				}
			}
			ts.forEachChild(node, inspect);
		};
		inspect(evidence.sourceFile);
	}
	const missingPositiveExports = [...publicExports]
		.filter(([key]) => !assertedExports.has(key))
		.map(([, { name, specifier }]) => `${specifier}.${name}`)
		.sort();
	return {
		checker,
		fileEvidence,
		hasNegativeControl,
		hasPositiveAssertion,
		importedEntries,
		missingPositiveExports,
		provenanceBySymbol,
		trustedAssertionSymbols,
		trustedTypeAliasSymbols,
	};
}

function structurallyMappedRegistrations(programFiles, analysis) {
	const registrations = new Set();
	for (const filePath of programFiles) {
		const evidence = analysis.fileEvidence.get(filePath);
		if (!evidence) continue;
		const { sourceFile, taintedSymbols } = evidence;
		const visit = (node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === 'assertUpstreamRegistration' &&
				ts.isStringLiteral(node.arguments[0]) &&
				node.arguments[1] &&
				referencesSymbols(node.arguments[1], analysis.checker, taintedSymbols) &&
				collectPositiveAssertionProvenance(
					node.arguments[1],
					analysis.checker,
					analysis.provenanceBySymbol,
					analysis.trustedAssertionSymbols,
					analysis.trustedTypeAliasSymbols,
				).size > 0
			) {
				registrations.add(node.arguments[0].text);
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}
	return registrations;
}

function assertTypeProjectSemantics(gateId, commandArguments, node, workspaceRoot) {
	const packageDirectory = bindingPackageDirectory(node, workspaceRoot);
	const projectPath = path.resolve(workspaceRoot, commandArguments[5]);
	const relativeProject = path.relative(packageDirectory, projectPath);
	if (relativeProject.startsWith('..') || path.isAbsolute(relativeProject)) {
		throw new Error(`Type project for ${gateId} escapes the binding package`);
	}
	const loaded = ts.readConfigFile(projectPath, ts.sys.readFile);
	if (loaded.error) {
		throw new Error(`Type project for ${gateId} is invalid: ${loaded.error.messageText}`);
	}
	const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(projectPath));
	if (parsed.errors.length > 0) {
		throw new Error(`Type project for ${gateId} cannot be parsed`);
	}
	if (parsed.options.strict !== true || parsed.options.skipLibCheck !== false) {
		throw new Error(`Type project for ${gateId} must enable strict and disable skipLibCheck`);
	}
	if (loaded.config.reactPortEvidence?.gate !== gateId) {
		throw new Error(`Type project for ${gateId} must declare reactPortEvidence.gate`);
	}
	const programFiles = parsed.fileNames.map((filePath) => path.resolve(filePath));
	if (programFiles.length === 0) throw new Error(`Type project for ${gateId} has no source files`);
	const within = (directory) =>
		programFiles.some((filePath) => {
			const relative = path.relative(path.join(packageDirectory, directory), filePath);
			return !relative.startsWith('..') && !path.isAbsolute(relative);
		});
	if (gateId === 'authored-source-types') {
		if (!within('src')) {
			throw new Error('Authored source type project must compile the package src directory');
		}
		const selectedFiles = new Set(programFiles);
		const omittedFiles = authoredSourceFiles(packageDirectory).filter(
			(filePath) =>
				!selectedFiles.has(filePath) &&
				!(
					filePath.endsWith('.tsrx') &&
					configSelectsCustomSource(loaded.config, path.dirname(projectPath), filePath)
				),
		);
		if (omittedFiles.length > 0) {
			throw new Error(
				`Authored source type project omits authored source: ${omittedFiles
					.map((filePath) => path.relative(packageDirectory, filePath))
					.join(', ')}`,
			);
		}
	}
	if (gateId === 'public-types') {
		if (!within('tests/types')) {
			throw new Error('Public type project must compile package tests/types sources');
		}
		if (node.binding) {
			const trustedTypeAssertionModulePath = canonicalPath(
				path.join(workspaceRoot, 'scripts/react-port/type-assertions.d.ts'),
			);
			const semantics = analyzeTypeEvidence(
				programFiles,
				parsed,
				concretePublicSpecifiers(packageDirectory, node.binding),
				trustedTypeAssertionModulePath,
			);
			if (!semantics.hasPositiveAssertion) {
				throw new Error('Public type project must contain a positive type assertion');
			}
			if (semantics.missingPositiveExports.length > 0) {
				throw new Error(
					`Public type project must contain a positive assertion for every imported public export: ${semantics.missingPositiveExports.join(', ')}`,
				);
			}
			if (!semantics.hasNegativeControl) {
				throw new Error(
					'Public type project must contain a @ts-expect-error negative control tied to an imported public binding',
				);
			}
		}
	}
	if (gateId.startsWith('upstream-types-')) {
		if (!within('tests/types') && !within('typetests')) {
			throw new Error('Upstream type project must compile package-local upstream type sources');
		}
		const expectedRegistrations = (node.upstreamTestInventory ?? [])
			.filter(({ kind }) => kind === 'type')
			.flatMap(({ registrations }) => registrations.map(({ id }) => id))
			.sort();
		const declaredRegistrations = loaded.config.reactPortEvidence?.upstreamRegistrations;
		if (
			!Array.isArray(declaredRegistrations) ||
			JSON.stringify([...declaredRegistrations].sort()) !== JSON.stringify(expectedRegistrations)
		) {
			throw new Error(
				`Type project for ${gateId} is not bound to the pinned immutable type inventory`,
			);
		}
		const expectedImport = gateId === 'upstream-types-pristine' ? node.packageName : node.binding;
		if (!expectedImport) {
			throw new Error(`Type project for ${gateId} has no graph-planned package import`);
		}
		const analysis = analyzeTypeEvidence(
			programFiles,
			parsed,
			[expectedImport],
			canonicalPath(path.join(workspaceRoot, 'scripts/react-port/type-assertions.d.ts')),
		);
		if (!analysis.hasPositiveAssertion || !analysis.hasNegativeControl) {
			throw new Error(
				`Type project for ${gateId} must contain positive and negative assertions tied to ${expectedImport}`,
			);
		}
		if (analysis.missingPositiveExports.length > 0) {
			throw new Error(
				`Type project for ${gateId} must contain a positive assertion for every imported public export: ${analysis.missingPositiveExports.join(', ')}`,
			);
		}
		const mappedRegistrations = structurallyMappedRegistrations(programFiles, analysis);
		for (const registrationId of expectedRegistrations) {
			if (!mappedRegistrations.has(registrationId)) {
				throw new Error(
					`Type project for ${gateId} does not structurally map pinned registration ${registrationId} to a real assertion group`,
				);
			}
		}
	}
}

export function assertApprovedGateCommand(
	gateIds,
	commandArguments,
	node,
	{ workspaceRoot = null, manifestPath = null, nodeId = null } = {},
) {
	const bindingDirectory = node.bindingDirectory?.replaceAll('\\', '/');
	if (!bindingDirectory) throw new Error('Evidence node has no graph-planned binding directory');
	let packageTestPlan = null;
	const absenceCommand = Boolean(
		workspaceRoot &&
		manifestPath &&
		nodeId &&
		isExactCommand(commandArguments, [
			'node',
			'scripts/react-port/upstream-types-absence.mjs',
			'--package-dir',
			bindingDirectory,
			'--manifest',
			manifestPath,
			'--node',
			nodeId,
		]),
	);
	for (const gateId of gateIds) {
		let approved = false;
		if (absenceCommand && ['upstream-types-pristine', 'upstream-types-adapted'].includes(gateId)) {
			approved = true;
		} else if (gateId === 'package-tests') {
			approved = isExactCommand(commandArguments, ['pnpm', '--dir', bindingDirectory, 'test']);
		} else if (gateId === 'public-exports') {
			approved = isExactCommand(commandArguments, [
				'node',
				'scripts/react-port/public-exports.mjs',
				'--package-dir',
				bindingDirectory,
			]);
		} else if (PARITY_GATES.has(gateId)) {
			approved = isExactCommand(commandArguments, [
				'node',
				'scripts/react-parity/harness.mjs',
				'run-required',
				'--manifest',
				`${bindingDirectory}/audit/react-parity.json`,
			]);
		} else if (gateId === 'upstream-types-pristine') {
			approved = isTypeProjectCommand(commandArguments, bindingDirectory, gateId, 'tsc');
		} else if (
			['upstream-types-adapted', 'authored-source-types', 'public-types'].includes(gateId)
		) {
			approved = isTypeProjectCommand(commandArguments, bindingDirectory, gateId, 'tsrx-tsc');
		} else if (PACK_GATES.has(gateId)) {
			approved = isExactCommand(commandArguments, ['pnpm', 'packages:pack:check']);
		} else if (gateId === 'generated-data') {
			approved = isExactCommand(commandArguments, ['pnpm', 'sync']);
		} else if (gateId === 'format') {
			approved = isExactCommand(commandArguments, ['pnpm', 'format:check']);
		}
		if (!approved) {
			throw new Error(
				`Command is not an approved command for ${gateId}; use the gate-owned command documented by the React library port skill`,
			);
		}
		if (workspaceRoot && gateId === 'package-tests') {
			packageTestPlan = assertPackageTestSemantics(node, workspaceRoot);
		}
		if (workspaceRoot && gateId === 'public-exports') {
			inspectPublicExports(bindingPackageDirectory(node, workspaceRoot));
		}
		if (
			!absenceCommand &&
			workspaceRoot &&
			[
				'upstream-types-pristine',
				'upstream-types-adapted',
				'authored-source-types',
				'public-types',
			].includes(gateId)
		) {
			assertTypeProjectSemantics(gateId, commandArguments, node, workspaceRoot);
		}
	}
	return { packageTestPlan };
}

async function operate(
	command,
	options,
	manifest,
	batchDirectory,
	commandArguments,
	assertCommand,
) {
	const node = manifest.nodes[options.node];
	if (!node) throw new Error(`Batch has no node ${options.node}`);
	const credentialValues = credentialValuesFromEnvironment();

	if (command === 'init') {
		if (node.state !== 'ready' && node.state !== 'implementing') {
			throw new Error(`Evidence can start only from ready/implementing, received ${node.state}`);
		}
		if (options.category.length === 0) throw new Error('init requires at least one --category');
		if (node.state === 'ready') {
			if (!node.bindingDirectory)
				throw new Error(`Node ${options.node} has no planned binding path`);
			const workspaceRoot = manifest.workspaceRoot ?? path.dirname(path.resolve(options.workRoot));
			assertPlannedPathIsSafe(workspaceRoot, node.bindingDirectory);
			const collisions = detectNodeWorktreeCollisions({
				repoRoot: workspaceRoot,
				bindingDirectory: node.bindingDirectory,
				baseline: manifest.baseline,
			});
			if (collisions.length > 0) {
				throw new Error(`Worktree collision in planned binding path(s): ${collisions.join(', ')}`);
			}
			node.evidenceMatrix = createEvidenceMatrix({
				categories: options.category,
				preflightArtifact: path.join(
					path.resolve(options.workRoot),
					manifest.batchId,
					'manifest.json',
				),
			});
			transitionNodeState(manifest, options.node, 'implementing', {
				evidenceFingerprint: node.evidenceFingerprint,
			});
		} else {
			const requestedCategories = [...new Set(options.category)].sort();
			if (JSON.stringify(node.evidenceMatrix?.categories) !== JSON.stringify(requestedCategories)) {
				throw new Error('Implementing node already has a different evidence category matrix');
			}
			if (!isCurrentEvidenceMatrix(node.evidenceMatrix)) {
				node.evidenceMatrix = createEvidenceMatrix({
					categories: requestedCategories,
					preflightArtifact: path.join(
						path.resolve(options.workRoot),
						manifest.batchId,
						'manifest.json',
					),
				});
				delete node.evidence;
			}
		}
		return { schemaVersion: 1, command, status: 'passed', nodeId: options.node, state: node.state };
	}

	if (node.state !== 'implementing' || !node.evidenceMatrix) {
		throw new Error(
			`Node ${options.node} must be implementing with an initialized evidence matrix`,
		);
	}
	assertCurrentEvidenceMatrix(node.evidenceMatrix);
	if (command === 'record') {
		if (options.gate.length !== 1 || !options.status) {
			throw new Error('record requires exactly one --gate and --status');
		}
		const gateId = options.gate[0];
		const gate = node.evidenceMatrix.gates[gateId];
		if (!gate) throw new Error(`Unknown evidence gate: ${gateId}`);
		if (options.command) {
			throw new Error('record cannot claim command evidence; use the gate-owned run command');
		}
		if (['passed', 'failed'].includes(options.status)) {
			if (gate.evidenceType === 'command') {
				throw new Error(`Evidence gate ${gateId} is command-backed; use run`);
			}
			if (gate.evidenceType === 'automated') {
				throw new Error(`Evidence gate ${gateId} is computed by verify`);
			}
			if (!options.artifact) {
				throw new Error('record passed/failed evidence requires an existing --artifact');
			}
			options.artifact = path.resolve(options.artifact);
			if (!existsSync(options.artifact)) {
				throw new Error(`record artifact does not exist: ${options.artifact}`);
			}
		}
		const evidence = sanitizeForReport(
			{
				status: options.status,
				command: options.command,
				artifact: options.artifact,
				observed: options.observed,
				reason: options.reason,
				repair: options.repair,
			},
			'',
			credentialValues,
		);
		recordEvidence(node.evidenceMatrix, gateId, evidence);
		return {
			schemaVersion: 1,
			command,
			status: 'passed',
			nodeId: options.node,
			gate: node.evidenceMatrix.gates[gateId],
		};
	}
	if (command === 'run') {
		const gateIds = [...new Set(options.gate)];
		if (gateIds.length === 0) throw new Error('run requires at least one --gate');
		for (const gateId of gateIds) {
			if (!node.evidenceMatrix.gates[gateId]) {
				throw new Error(`Unknown evidence gate: ${gateId}`);
			}
		}
		if (commandArguments.length === 0) {
			throw new Error('run requires an executable and arguments after --');
		}
		const commandValidation = assertCommand(gateIds, commandArguments, node, {
			workspaceRoot: manifest.workspaceRoot ?? process.cwd(),
			manifestPath: path.join(batchDirectory, 'manifest.json'),
			nodeId: options.node,
		});
		const packageTestPlan = gateIds.includes('package-tests')
			? (commandValidation?.packageTestPlan ??
				packageTestExecutionPlan(node, manifest.workspaceRoot ?? process.cwd()))
			: null;
		const reportDirectory = packageTestPlan
			? mkdtempSync(path.join(tmpdir(), 'react-port-package-tests-'))
			: null;
		const nodeProxyDirectory = packageTestPlan?.runners.includes('node-test')
			? createNodeCommandProxy()
			: null;
		const executedArguments = packageTestPlan
			? instrumentPackageTestCommand(commandArguments, packageTestPlan)
			: commandArguments;
		const commandDisplay = sanitizeForReport(
			JSON.stringify(commandArguments),
			'',
			credentialValues,
		);
		let evidence;
		try {
			const { stdout, stderr } = await execFileAsync(
				executedArguments[0],
				executedArguments.slice(1),
				{
					cwd: manifest.workspaceRoot ?? process.cwd(),
					encoding: 'utf8',
					env: reportDirectory
						? {
								...process.env,
								NODE_OPTIONS:
									`${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'package-test-reporter-hook.mjs')).href}`.trim(),
								PATH: nodeProxyDirectory
									? `${nodeProxyDirectory}${path.delimiter}${process.env.PATH ?? ''}`
									: process.env.PATH,
								REACT_PORT_TEST_REPORT_DIR: reportDirectory,
							}
						: process.env,
					maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
					timeout: commandTimeout(options),
					windowsHide: true,
				},
			);
			if (packageTestPlan) {
				assertPackageTestReport(packageTestPlan, reportDirectory);
			}
			evidence = {
				status: 'passed',
				command: commandDisplay,
				observed: commandObservation(stdout, stderr, 'Exited with status 0.', credentialValues),
			};
		} catch (error) {
			evidence = {
				status: 'failed',
				command: commandDisplay,
				observed: commandObservation(
					error?.stdout,
					error?.stderr,
					error instanceof Error ? error.message : String(error),
					credentialValues,
				),
			};
		} finally {
			if (reportDirectory) rmSync(reportDirectory, { force: true, recursive: true });
			if (nodeProxyDirectory) rmSync(nodeProxyDirectory, { force: true, recursive: true });
		}
		for (const gateId of gateIds) {
			recordEvidence(node.evidenceMatrix, gateId, evidence);
		}
		const gates = gateIds.map((gateId) => node.evidenceMatrix.gates[gateId]);
		return {
			schemaVersion: 1,
			command,
			status: evidence.status === 'passed' ? 'passed' : 'blocked',
			nodeId: options.node,
			...(gates.length === 1 ? { gate: gates[0] } : { gates }),
		};
	}

	for (const required of [
		'packageDir',
		'expectedDirectory',
		'registrations',
		'crosswalk',
		'closure',
	]) {
		if (!options[required])
			throw new Error(
				`verify requires --${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
			);
	}
	if (!node.binding || !node.bindingDirectory) {
		throw new Error(`Node ${options.node} has no graph-planned binding name and directory`);
	}
	if (options.expectedDirectory !== node.bindingDirectory) {
		throw new Error(`--expected-directory must match the graph plan: ${node.bindingDirectory}`);
	}
	const workspaceRoot = manifest.workspaceRoot ?? path.dirname(path.resolve(options.workRoot));
	const plannedPackageDirectory = path.resolve(workspaceRoot, node.bindingDirectory);
	assertPlannedPathIsSafe(workspaceRoot, node.bindingDirectory);
	const packageDirectory = path.resolve(options.packageDir);
	if (canonicalPath(packageDirectory) !== canonicalPath(plannedPackageDirectory)) {
		throw new Error(
			`--package-dir must match the graph-planned workspace directory: ${plannedPackageDirectory}`,
		);
	}
	const registrations = readJson(options.registrations, 'registrations');
	const crosswalk = readJson(options.crosswalk, 'crosswalk');
	const closure = readJson(options.closure, 'closure');
	let crosswalkReport;
	try {
		crosswalkReport = validateUpstreamCrosswalk(
			registrations,
			crosswalk,
			node.upstreamTestInventory,
			plannedPackageDirectory,
		);
	} catch (error) {
		crosswalkReport = {
			status: 'blocked',
			issues: [error instanceof Error ? error.message : String(error)],
			cases: [],
		};
	}
	const attribution = attributionHashes(node);
	const packageReport = inspectBindingPackage(plannedPackageDirectory, {
		expectedPackageName: node.binding,
		expectedDirectory: options.expectedDirectory,
		identity: node.identity,
		expectedLicenseHashes: attribution.licenses,
		expectedNoticeHashes: attribution.notices,
	});
	const closureReport = auditShippedClosure({
		nodeId: options.node,
		graphNodes: manifest.nodes,
		runtimeDependencies: closure.runtimeDependencies ?? [],
		adaptedSources: closure.adaptedSources ?? [],
		sourceLedger: closure.sourceLedger,
		reimplementedDependencies: closure.reimplementedDependencies ?? [],
		evidenceRoot: plannedPackageDirectory,
		packageDirectory: plannedPackageDirectory,
	});
	setAutomatedGate(node.evidenceMatrix, 'upstream-crosswalk', crosswalkReport, {
		artifact: path.resolve(options.crosswalk),
		passedObserved: `${crosswalkReport.cases.length} upstream registrations classified`,
		repair: 'Restore every registration and supply local evidence or a durable rationale.',
	});
	for (const gateId of ['package-contract', 'provenance']) {
		setAutomatedGate(node.evidenceMatrix, gateId, packageReport, {
			artifact: plannedPackageDirectory,
			passedObserved: 'Package shape and durable provenance passed inspection.',
			repair: 'Complete the reported package/provenance artifacts and rerun verification.',
		});
	}
	setAutomatedGate(node.evidenceMatrix, 'closure-audit', closureReport, {
		artifact: path.resolve(options.closure),
		passedObserved:
			'Actual runtime imports, adapted sources, and clean-room proofs match the graph.',
		repair:
			'Return new runtime/adapted edges to classification and supply every planned clean-room proof.',
	});
	const readiness = evaluateVerificationReadiness({
		matrix: node.evidenceMatrix,
		crosswalkReport,
		packageReport,
		closureReport,
	});
	if (readiness.status === 'verified') {
		transitionNodeState(manifest, options.node, 'verified', {
			evidenceFingerprint: node.evidenceFingerprint,
			evidence: { crosswalkReport, packageReport, closureReport, readiness },
		});
	}
	return sanitizeForReport(
		{
			schemaVersion: 1,
			command,
			status: readiness.status === 'verified' ? 'passed' : 'blocked',
			nodeId: options.node,
			state: node.state,
			issues: readiness.issues,
			crosswalkReport,
			packageReport,
			closureReport,
		},
		'',
		credentialValues,
	);
}

export async function main({
	argumentsList = process.argv.slice(2),
	assertCommand = assertApprovedGateCommand,
} = {}) {
	let parsed;
	try {
		parsed = parseArguments(argumentsList);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
		process.exitCode = 2;
		return;
	}
	const batchDirectory = path.join(parsed.options.workRoot, parsed.options.batch);
	const manifestPath = path.join(batchDirectory, 'manifest.json');
	if (!existsSync(manifestPath)) {
		process.stderr.write(`Batch manifest does not exist: ${manifestPath}\n`);
		process.exitCode = 2;
		return;
	}
	let lock;
	try {
		lock = await acquireBatchLock(batchDirectory, {
			owner: `evidence-${process.pid}`,
			allowStaleRecovery: parsed.options.recoverStaleLock,
		});
		const manifest = validateBatchManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
		const report = await operate(
			parsed.command,
			parsed.options,
			manifest,
			batchDirectory,
			parsed.commandArguments,
			assertCommand,
		);
		await writeManifestAtomically(batchDirectory, manifest, { owner: lock.owner });
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		if (report.status === 'blocked') process.exitCode = 2;
	} catch (error) {
		process.stderr.write(
			`${sanitizeForReport(error instanceof Error ? error.message : String(error), '', credentialValuesFromEnvironment())}\n`,
		);
		process.exitCode = 2;
	} finally {
		if (lock) await releaseBatchLock(lock);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
