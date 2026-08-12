import { create } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import {
	AutoAttachArrayScene,
	MixedAutoAttachArrayScene,
} from './_fixtures/auto-attach.three.tsrx';

describe('renderer-owned array attachment', () => {
	it('attaches unplaced children in authored order and detaches their slots on teardown', async () => {
		const parent = { passes: [] as object[] };
		const first = { name: 'first' };
		const second = { name: 'second' };
		const root = await create(AutoAttachArrayScene, { parent, first, second });

		expect(parent.passes).toEqual([first, second]);
		root.unmount();
		expect(parent.passes).toEqual([undefined, undefined]);
	});

	it('does not reserve automatic slots for explicit or callback attachments', async () => {
		const parent = {
			passes: [] as object[],
			explicit: undefined as object | undefined,
			callback: undefined as object | undefined,
		};
		const explicit = { name: 'explicit' };
		const first = { name: 'first' };
		const callback = { name: 'callback' };
		const second = { name: 'second' };
		const attachCallback = (target: typeof parent, object: object) => {
			target.callback = object;
			return () => {
				target.callback = undefined;
			};
		};
		const root = await create(MixedAutoAttachArrayScene, {
			parent,
			explicit,
			first,
			callback,
			second,
			attachCallback,
		});

		expect(parent.explicit).toBe(explicit);
		expect(parent.callback).toBe(callback);
		expect(parent.passes).toEqual([first, second]);
		root.unmount();
		expect(parent.explicit).toBeUndefined();
		expect(parent.callback).toBeUndefined();
		expect(parent.passes).toEqual([undefined, undefined]);
	});
});
