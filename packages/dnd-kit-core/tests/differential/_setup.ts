import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileReactFixture } from './_react-fixture';

export function setup(): void {
	compileReactFixture(dirname(fileURLToPath(import.meta.url)));
}
