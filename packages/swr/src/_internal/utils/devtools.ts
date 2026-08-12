import * as Octane from 'octane';
import type { Middleware } from '../types.js';
import { readDevtoolsMiddleware, setupOctaneDevtools } from '../devtools-contract.js';
import { isWindowDefined } from './helper.js';

export const use: Middleware[] = isWindowDefined ? readDevtoolsMiddleware<Middleware>(window) : [];

export const setupDevTools = (): void => {
	if (isWindowDefined) setupOctaneDevtools(window, Octane);
};
