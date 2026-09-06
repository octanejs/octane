import { Store } from '@octanejs/base-ui-utils/store';
import { useStableCallback } from '@octanejs/base-ui-utils/useStableCallback';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';

const store = new Store({ count: 0, label: 'Items' });
store.set('count', 1);
store.update({ label: 'Selected' });
type Snapshot = Assert<
	Equal<ReturnType<typeof store.getSnapshot>, { count: number; label: string }>
>;
// @ts-expect-error a known store key retains its value type
store.set('count', 'one');
// @ts-expect-error unknown fields cannot be added by an update
store.update({ missing: true });

const add = useStableCallback((left: number, right: number) => left + right);
type Result = Assert<Equal<ReturnType<typeof add>, number>>;
// @ts-expect-error stable callbacks retain their argument types
add('one', 2);
