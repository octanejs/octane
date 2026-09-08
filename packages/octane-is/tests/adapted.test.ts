import { resolve } from 'node:path';
import { registerUpstream } from './register-upstream.js';
registerUpstream(resolve(import.meta.dirname, 'upstream/ReactIs-test.js'), true);
