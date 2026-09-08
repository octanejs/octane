#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_NODE_RUNTIME_ARGUMENTS = 256;
const NODE_ENTRY_POINT_OPTIONS = new Set([
	'-c',
	'--check',
	'-e',
	'--eval',
	'-p',
	'--print',
	'--run',
]);
const NODE_TERMINATING_OPTIONS = new Set([
	'--completion-bash',
	'-h',
	'--help',
	'-v',
	'--v8-options',
	'--version',
]);

function optionAliases(name) {
	if (!name.startsWith('--')) return [name];
	const body = name.slice(2);
	return [...new Set([name, `--${body.replaceAll('_', '-')}`, `--${body.replaceAll('-', '_')}`])];
}

function addOptionSyntax(syntax, name, optionSyntax) {
	for (const alias of optionAliases(name)) {
		if (!syntax.has(alias)) syntax.set(alias, optionSyntax);
	}
}

function loadNodeRuntimeOptionSyntax() {
	const result = spawnSync(process.execPath, ['--help'], {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024,
		timeout: 5_000,
		windowsHide: true,
	});
	if (result.status !== 0 || typeof result.stdout !== 'string') return null;
	const syntax = new Map();
	for (const line of result.stdout.split(/\r?\n/)) {
		if (!line.startsWith('  -') || line.startsWith('  - ')) continue;
		const optionColumn = line
			.slice(2)
			.split(/\s{2,}/, 1)[0]
			.trim();
		const variants = optionColumn.split(/,\s+/).map((variant) => {
			const match = variant.match(/^(-{1,2}\S+?)(?==|\s|\[|$)(.*)$/);
			return match ? { name: match[1], suffix: match[2] } : null;
		});
		if (variants.some((variant) => variant === null)) continue;
		const takesSeparateValue = variants.some(({ suffix }) => suffix.startsWith('='));
		for (const { name, suffix } of variants) {
			addOptionSyntax(syntax, name, {
				acceptsInlineValue: takesSeparateValue || suffix.startsWith('[='),
				takesSeparateValue,
			});
		}
	}
	for (const name of process.allowedNodeEnvironmentFlags) {
		addOptionSyntax(syntax, name, {
			acceptsInlineValue: true,
			takesSeparateValue: false,
		});
	}
	const v8Result = spawnSync(process.execPath, ['--v8-options'], {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024,
		timeout: 5_000,
		windowsHide: true,
	});
	if (v8Result.status === 0 && typeof v8Result.stdout === 'string') {
		const lines = v8Result.stdout.split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			const name = line.match(/^\s+(--[A-Za-z0-9][A-Za-z0-9_-]*)\s+\(/)?.[1];
			if (!name) continue;
			const optionSyntax = {
				acceptsInlineValue: true,
				takesSeparateValue: false,
			};
			addOptionSyntax(syntax, name, optionSyntax);
			if (/^\s+type:\s+bool\b/.test(lines[index + 1] ?? '')) {
				addOptionSyntax(syntax, `--no-${name.slice(2)}`, optionSyntax);
			}
		}
	}
	return syntax.has('--test') ? syntax : null;
}

const NODE_RUNTIME_OPTION_SYNTAX = loadNodeRuntimeOptionSyntax();

function inspectNodeRuntimeArguments(arguments_) {
	if (!NODE_RUNTIME_OPTION_SYNTAX || arguments_.length > MAX_NODE_RUNTIME_ARGUMENTS) return null;
	let isTestInvocation = false;
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === '--' || argument === '-' || !argument.startsWith('-')) {
			return { boundary: index, isTestInvocation };
		}

		const equalsIndex = argument.indexOf('=');
		let optionName = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
		let syntax = NODE_RUNTIME_OPTION_SYNTAX.get(optionName);
		if (!syntax && equalsIndex === -1 && argument.startsWith('-') && !argument.startsWith('--')) {
			optionName = argument.slice(0, 2);
			syntax = NODE_RUNTIME_OPTION_SYNTAX.get(optionName);
			if (!syntax?.takesSeparateValue || argument.length === optionName.length) syntax = null;
		}
		if (!syntax) return null;
		if (NODE_ENTRY_POINT_OPTIONS.has(optionName) || NODE_TERMINATING_OPTIONS.has(optionName)) {
			return { boundary: arguments_.length, isTestInvocation: false };
		}
		if (equalsIndex !== -1 && !syntax.acceptsInlineValue && optionName !== '--test') return null;
		if (syntax.takesSeparateValue && equalsIndex === -1 && argument === optionName) {
			if (index + 1 >= arguments_.length) return null;
			index += 1;
		}
		isTestInvocation ||= optionName === '--test';
	}
	return { boundary: arguments_.length, isTestInvocation };
}

export function nodeRuntimeOptionBoundary(arguments_) {
	return inspectNodeRuntimeArguments(arguments_)?.boundary ?? null;
}

export function isNodeTestInvocation(arguments_) {
	return inspectNodeRuntimeArguments(arguments_)?.isTestInvocation ?? false;
}

function countTestReportOptions(arguments_) {
	return {
		destinations: arguments_.filter(
			(argument) =>
				argument === '--test-reporter-destination' ||
				argument.startsWith('--test-reporter-destination='),
		).length,
		reporters: arguments_.filter(
			(argument) => argument === '--test-reporter' || argument.startsWith('--test-reporter='),
		).length,
	};
}

function instrumentArguments(arguments_, reporterPath, reportPath) {
	const insertionIndex = nodeRuntimeOptionBoundary(arguments_);
	if (insertionIndex === null) return arguments_;
	const { destinations, reporters } = countTestReportOptions(arguments_.slice(0, insertionIndex));
	const existingReporterDestination =
		reporters === 1 && destinations === 0 ? ['--test-reporter-destination=stdout'] : [];
	return [
		...arguments_.slice(0, insertionIndex),
		...existingReporterDestination,
		`--test-reporter=${pathToFileURL(reporterPath).href}`,
		`--test-reporter-destination=${reportPath}`,
		...arguments_.slice(insertionIndex),
	];
}

function printStableSummary(report) {
	const passed = Number(report.numPassedTests ?? 0);
	const failed = Number(report.numFailedTests ?? 0);
	const skipped = Number(report.numPendingTests ?? 0);
	const todo = Number(report.numTodoTests ?? 0);
	process.stdout.write(
		`# tests ${passed + failed + skipped + todo}\n# pass ${passed}\n# fail ${failed}\n# skipped ${skipped}\n# todo ${todo}\n`,
	);
}

function main() {
	const arguments_ = process.argv.slice(2);
	const reportDirectory = process.env.REACT_PORT_TEST_REPORT_DIR;
	const isTestInvocation = isNodeTestInvocation(arguments_);

	let invocationPath = null;
	let reportPath = null;
	let invocation = null;
	let executedArguments = arguments_;

	if (reportDirectory && isTestInvocation) {
		const invocationId = randomUUID();
		const reportFile = `node-test-${process.pid}-${invocationId}.report.json`;
		reportPath = path.join(reportDirectory, reportFile);
		invocationPath = path.join(
			reportDirectory,
			`node-test-${process.pid}-${invocationId}.invocation.json`,
		);
		invocation = {
			schemaVersion: 1,
			invocationId,
			runner: 'node-test',
			argv: arguments_,
			reportFile,
			status: 'running',
		};
		writeFileSync(invocationPath, JSON.stringify(invocation));
		const reporterPath = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'node-test-reporter.mjs',
		);
		executedArguments = instrumentArguments(arguments_, reporterPath, reportPath);
	}

	const childEnvironment = { ...process.env };
	delete childEnvironment.NODE_TEST_CONTEXT;
	const result = spawnSync(process.execPath, executedArguments, {
		env: childEnvironment,
		stdio: 'inherit',
		windowsHide: true,
	});

	if (invocationPath) {
		if (existsSync(reportPath)) {
			try {
				printStableSummary(JSON.parse(readFileSync(reportPath, 'utf8')));
			} catch {
				// The evidence verifier reports malformed runner output with the invocation context.
			}
		}
		writeFileSync(
			invocationPath,
			JSON.stringify({
				...invocation,
				status: result.status,
				signal: result.signal,
				error: result.error?.message,
			}),
		);
	}

	if (result.signal) process.kill(process.pid, result.signal);
	process.exit(result.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
