import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyUpstream } from './upstream-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const result = verifyUpstream(packageRoot);
console.log(
	`react-window upstream verified: ${result.files} files, ${result.testFiles} test files, ${result.testCases} cases, ${result.runtimeExports} runtime exports, ${result.typeExports} type exports`,
);
