import { flushSync, hydrateRoot, type Root } from 'octane';
import { DeepWrapperChain } from './fixture.tsrx';

export interface HydratedCase {
	durationMs: number;
	leaf: HTMLButtonElement;
	root: Root;
}

export function hydrateCase(container: HTMLElement, depth: number): HydratedCase {
	const leaf = container.querySelector<HTMLButtonElement>('[data-hydration-range-leaf]');
	if (leaf === null) throw new Error(`The ${depth}-wrapper server leaf is missing.`);

	const started = performance.now();
	const root = hydrateRoot(container, DeepWrapperChain, { depth });
	const durationMs = performance.now() - started;

	if (container.querySelector('[data-hydration-range-leaf]') !== leaf) {
		root.unmount();
		throw new Error(`Hydration replaced the ${depth}-wrapper server leaf.`);
	}
	flushSync(() => leaf.click());
	if (leaf.textContent !== 'count:1') {
		root.unmount();
		throw new Error(`The ${depth}-wrapper leaf did not handle its delegated click.`);
	}
	return { durationMs, leaf, root };
}
