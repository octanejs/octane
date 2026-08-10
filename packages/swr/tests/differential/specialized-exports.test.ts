import { describe, expect, it } from 'vitest';
import * as immutable from '../../src/immutable/index';
import * as infinite from '../../src/infinite/index';
import * as mutation from '../../src/mutation/index';
import * as subscription from '../../src/subscription/index';
import * as reactImmutable from '../../upstream/src/immutable/index';
import * as reactInfinite from '../../upstream/src/infinite/index';
import * as reactMutation from '../../upstream/src/mutation/index';
import * as reactSubscription from '../../upstream/src/subscription/index';

describe('SWR U4 exact specialized runtime oracles', () => {
	// @parity-case differential:specialized-exports
	it('matches every pinned specialized runtime name', () => {
		expect(Object.keys(infinite).sort()).toEqual(Object.keys(reactInfinite).sort());
		expect(Object.keys(immutable).sort()).toEqual(Object.keys(reactImmutable).sort());
		expect(Object.keys(mutation).sort()).toEqual(Object.keys(reactMutation).sort());
		expect(Object.keys(subscription).sort()).toEqual(Object.keys(reactSubscription).sort());
	});
});
