import { expect, it } from 'vitest';
import { createRoot, flushSync } from '../src/index.js';
import {
	__enableSignalDocument,
	ScopeDisposedError,
	currentSignalOwner,
	signal$,
	type SignalOwner,
} from '../src/signals/index.js';
import { OwnerNestedBubble } from './_fixtures/event-signal-owner.tsrx';

// The signal document is process-wide, so this file owns its activation.
__enableSignalDocument();

it('keeps a deleted component retired for its queued bubble handler', () => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	const seen: (SignalOwner | null)[] = [];
	const reads: unknown[] = [];
	try {
		const props = {
			show: true,
			remove() {
				seen.push(currentSignalOwner());
				flushSync(() => root.render(OwnerNestedBubble, { ...props, show: false }));
			},
			bubble() {
				seen.push(currentSignalOwner());
				try {
					reads.push(signal$(0, { key: 'retired-scope-draft' }).get());
				} catch (error) {
					reads.push(error);
				}
			},
		};
		root.render(OwnerNestedBubble, props);
		const documentOwner = currentSignalOwner();
		container.querySelector('button')!.click();
		expect(container.querySelector('main')).toBeNull();
		// Each handler runs under its own component's authority, which the host
		// keeps after the inner handler deletes the outer component. The queued
		// outer handler must not mint live instance state for the deleted component.
		expect(seen).toHaveLength(2);
		expect(seen[0]).not.toBeNull();
		expect(seen[1]).not.toBeNull();
		expect(seen[1]).not.toBe(seen[0]);
		expect(seen[1]).not.toBe(documentOwner);
		expect(reads).toHaveLength(1);
		expect(reads[0]).toBeInstanceOf(ScopeDisposedError);
	} finally {
		root.unmount();
		container.remove();
	}
});
