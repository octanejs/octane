import { isWebGL2Available } from '../src/index.js';

const available: boolean = isWebGL2Available();
available;

// @ts-expect-error the capability probe takes no arguments
isWebGL2Available('webgl2');
