import { use as devtoolsUse } from './devtools.js';
import { middleware as preload } from './preload.js';

export const BUILT_IN_MIDDLEWARE = devtoolsUse.concat(preload);
