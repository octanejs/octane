import { AsyncLocalStorage } from 'node:async_hooks';
import type { TailwindConfig } from './preset.ts';

export interface TailwindBoundaryOptions {
	config?: TailwindConfig;
	theme?: string;
	utility?: string;
}

interface TailwindCollection {
	nextId: number;
	boundaries: Map<string, TailwindBoundaryOptions>;
}

const collections = new AsyncLocalStorage<TailwindCollection>();

export function registerTailwindBoundary(options: TailwindBoundaryOptions): string {
	const collection = collections.getStore();
	if (!collection) {
		throw new Error('Tailwind must be rendered through the react-email render() pipeline.');
	}
	const id = `tw-${collection.nextId++}`;
	collection.boundaries.set(id, options);
	return id;
}

export async function collectTailwindBoundaries<T>(
	render: () => T | Promise<T>,
): Promise<{ value: T; boundaries: Map<string, TailwindBoundaryOptions> }> {
	const collection: TailwindCollection = { nextId: 0, boundaries: new Map() };
	const value = await collections.run(collection, render);
	return { value, boundaries: collection.boundaries };
}
