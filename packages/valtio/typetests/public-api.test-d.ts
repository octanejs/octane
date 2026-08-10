import { proxy } from '@octanejs/valtio/vanilla';
import { useSnapshot } from '@octanejs/valtio/react';
import { useProxy } from '@octanejs/valtio/react/utils';

const state = proxy({ count: 0, profile: { name: 'Ada' } });
const snapshot = useSnapshot(state, { sync: true });
const mutable = useProxy(state);

const count: number = snapshot.count;
const name: string = snapshot.profile.name;
mutable.count = count + 1;
void name;

// @ts-expect-error snapshots are deeply readonly
snapshot.count = 1;
