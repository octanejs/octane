// Importing @pierre/trees registers its `file-tree-container` element. jsdom has
// no ResizeObserver, which the tree's layout observes, so it gets the stub the
// upstream suite (upstream/test/file-tree-react.test.tsx) uses.
class MockResizeObserver {
	observe(_target: Element): void {}
	disconnect(): void {}
}

export function installFileTreeDom(): void {
	Object.assign(globalThis, { ResizeObserver: MockResizeObserver });
}

/** Upstream's `flushDom`: let the tree's microtasks and timers run. */
export async function flushDom(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

export const BASE_OPTIONS = {
	flattenEmptyDirectories: true,
	initialExpansion: 'open' as const,
	paths: ['README.md', 'src/index.ts'],
	initialVisibleRowCount: 120 / 30,
};

/** The item paths the tree rendered into `host`'s shadow root. */
export function renderedPaths(host: Element): string[] {
	return [...(host.shadowRoot?.querySelectorAll('[data-item-path]') ?? [])].map(
		(item) => item.getAttribute('data-item-path') ?? '',
	);
}
