import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { NativeEventConnectProbe } from '../_fixtures/native-events.tsrx';

describe('@octanejs/xyflow — native DOM events', () => {
	let root: ReturnType<typeof mount> | undefined;

	afterEach(function cleanup() {
		root?.unmount();
		root = undefined;
	});

	it('starts a click connection from the native click event', () => {
		const connectStarts: Event[] = [];
		const onClickConnectStart = vi.fn(function capture(event: MouseEvent | TouchEvent) {
			connectStarts.push(event);
		});

		root = mount(NativeEventConnectProbe, { onClickConnectStart });
		flushEffects();
		flushSync(function flush() {});

		root.click('.react-flow__handle.source');

		expect(onClickConnectStart).toHaveBeenCalledTimes(1);
		expect(connectStarts[0]).toBeInstanceOf(MouseEvent);
		expect('nativeEvent' in connectStarts[0]).toBe(false);
	});
});
