import { readFileSync } from 'node:fs';
import { normalize, sep } from 'node:path';
import { expect, it } from 'vitest';
import { runPristineUpstreamSuite } from '../../../scripts/react-parity/lottie-react-pristine-runtime.mjs';

// @parity-case pristine:lottie-react-original-suite
it('replays every pinned lottie-react registration with its recorded result', () => {
	const { cases } = JSON.parse(
		readFileSync(new URL('../audit/pristine-runtime.json', import.meta.url), 'utf8'),
	);
	const { status, identities, report, stdout, stderr } = runPristineUpstreamSuite();
	const expectedFailures = cases.filter((test) => test.status === 'failed');
	expect(status, stdout + stderr).toBe(expectedFailures.length ? 1 : 0);
	expect(identities).toEqual(cases.map(({ failure, ...test }) => test));
	for (const test of expectedFailures) {
		const relative = test.file.split('/upstream/')[1];
		const suite = report.testResults.find(({ name }) => name.endsWith(sep + normalize(relative)));
		const outcome = suite?.assertionResults.find(({ fullName }) => fullName === test.fullName);
		expect(outcome?.failureMessages[0]).toContain(test.failure);
	}
}, 120_000);
