import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileReactFixture } from '../../../dnd-kit-core/tests/differential/_react-fixture';

export function setup(): void {
	compileReactFixture(dirname(fileURLToPath(import.meta.url)));
}
