import { createResizeObserver } from 'octane';
import { createResizeObserver as createServerResizeObserver } from 'octane/server';

const observer: ResizeObserver = createResizeObserver((entries, currentObserver) => {
	const entry: ResizeObserverEntry = entries[0];
	const native: ResizeObserver = currentObserver;
	native.unobserve(entry.target);
}, ResizeObserver);
observer.observe(document.documentElement, { box: 'border-box' });
observer.disconnect();

const serverImport: typeof createResizeObserver = createServerResizeObserver;
serverImport;

// @ts-expect-error The callback receives native entries, not numeric measurements.
createResizeObserver((entries: number[]) => {});
// @ts-expect-error The injected constructor must construct a native observer.
createResizeObserver(() => {}, class {});
