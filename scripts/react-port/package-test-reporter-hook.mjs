import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A wrapper may start its own pristine suite. The package script plan counts
// the outer runner; its test assertions own the nested suite's result.
const reportDirectory = process.env.REACT_PORT_TEST_RUNNER_ACTIVE
	? undefined
	: process.env.REACT_PORT_TEST_REPORT_DIR;
const entryPoint = process.argv[1] ?? '';
const entryName = path.basename(entryPoint);

function registerInvocation(runner) {
	const invocationId = randomUUID();
	process.env.REACT_PORT_TEST_RUNNER_ACTIVE = invocationId;
	const reportFile = `${runner}-${process.pid}-${invocationId}.report.json`;
	writeFileSync(
		path.join(reportDirectory, `${runner}-${process.pid}-${invocationId}.invocation.json`),
		JSON.stringify({
			schemaVersion: 1,
			invocationId,
			runner,
			argv: process.argv.slice(1),
			reportFile,
		}),
	);
	return path.join(reportDirectory, reportFile);
}

function preserveJestReportPath(reportPath) {
	const args = process.argv.slice(2);
	let original;
	for (let i = 0; i < args.length; i++) {
		const match = args[i].match(/^--outputFile(?:=(.*))?$/);
		if (!match) continue;
		const value = match[1] ?? args[++i];
		if (value) original = path.resolve(value);
	}
	if (!original) {
		process.argv.push(`--outputFile=${reportPath}`);
		return;
	}
	// Pristine-suite wrappers read their own report after the child exits. Keep
	// that contract and copy the completed JSON into the gate's evidence directory.
	process.once('exit', () => {
		if (existsSync(original)) copyFileSync(original, reportPath);
	});
}

if (
	reportDirectory &&
	/^(?:vitest|cli)(?:\.m?js)?$/i.test(entryName) &&
	/vitest/i.test(entryPoint)
) {
	const reportPath = registerInvocation('vitest');
	process.env.REACT_PORT_VITEST_REPORT_FILE = reportPath;
	// Keep assertion failures visible while the JSON report supplies machine evidence.
	process.argv.push(
		'--reporter=default',
		`--reporter=${fileURLToPath(new URL('./package-test-json-reporter.mjs', import.meta.url))}`,
	);
} else if (reportDirectory && /^jest(?:\.m?js)?$/i.test(entryName)) {
	const reportPath = registerInvocation('jest');
	process.argv.push('--json');
	preserveJestReportPath(reportPath);
}
