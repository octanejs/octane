import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const reportDirectory = process.env.REACT_PORT_TEST_REPORT_DIR;
const entryPoint = process.argv[1] ?? '';
const entryName = path.basename(entryPoint);

function registerInvocation(runner) {
	// This report owns the package-script invocation. Nested pristine runners
	// keep their own report paths; their result is asserted by the parent test.
	delete process.env.REACT_PORT_TEST_REPORT_DIR;
	const invocationId = randomUUID();
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

if (
	reportDirectory &&
	/^(?:vitest|cli)(?:\.m?js)?$/i.test(entryName) &&
	/vitest/i.test(entryPoint)
) {
	const reportPath = registerInvocation('vitest');
	process.argv.push('--reporter=json', `--outputFile=${reportPath}`);
} else if (reportDirectory && /^jest(?:\.m?js)?$/i.test(entryName)) {
	const reportPath = registerInvocation('jest');
	process.argv.push('--json', `--outputFile=${reportPath}`);
}
