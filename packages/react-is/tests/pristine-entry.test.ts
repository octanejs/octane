import { resolve } from 'node:path';
import { registerUpstream } from './register-upstream.js';
const root = process.env.REACT_IS_PRISTINE_ROOT ?? resolve(import.meta.dirname, '../upstream');
registerUpstream(resolve(root, 'src/__tests__/ReactIs-test.js'), false);
