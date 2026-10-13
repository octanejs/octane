import { flushSync, hydrateRoot } from 'octane';
import { shellProps } from './props.ts';
import { Shell } from './shell.tsrx';

// The entry imports this module dynamically, so the renderer chunk loads on
// the same serialized import chain a production shell loads it on.
export function hydrate(container: HTMLElement) {
	return hydrateRoot(container, Shell, shellProps());
}

export { flushSync };
