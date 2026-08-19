import { runPristineUpstreamSuite } from '../../../scripts/react-parity/alien-signals-pristine-runtime.mjs';

const result = runPristineUpstreamSuite();
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
const passed = result.identities.filter(function isPassed(test) {
	return test.status === 'passed';
}).length;
const failed = result.identities.filter(function isFailed(test) {
	return test.status !== 'passed';
}).length;
console.log(`Alien Signals pristine upstream: ${passed} passed, ${failed} non-passing.`);
process.exitCode = result.status;
