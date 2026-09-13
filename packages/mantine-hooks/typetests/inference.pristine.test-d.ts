import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';
import * as Hooks from '@mantine/hooks';
// @parity-case types:mantine-hooks-pristine:inference
const host = { current: null as HTMLDivElement | null };
const spy = Hooks.useScrollSpy({ scrollHost: host });
type Heading = Assert<Equal<(typeof spy.data)[number]['getNode'], () => HTMLElement>>;
const [debounced, cancel, debounce] = Hooks.useDebouncedValue('text', 200, { leading: true });
type Debounced = Assert<Equal<typeof debounced, string>>;
type Cancel = Assert<Equal<typeof cancel, () => void>>;
debounce.flush();
const interval = Hooks.useInterval(() => {}, 80, { autoInvoke: true });
type Interval = Assert<Equal<typeof interval.active, boolean>>;
interval.stop();
const collapse = Hooks.useCollapse({ expanded: false, onTransitionEnd: () => {} });
type Collapse = Assert<Equal<typeof collapse.state, 'entering' | 'entered' | 'exiting' | 'exited'>>;
const floating = Hooks.useFloatingWindow<HTMLDivElement>({
	onPositionChange: (point) => {
		const x: number = point.x;
		void x;
	},
});
floating.setPosition({ left: 0, top: 10 });
const list = Hooks.useListState([{ id: 'a', count: 1 }]);
list[1].setItemProp(0, 'count', 2);
Hooks.useDidUpdate(() => () => {}, [debounced]);
// @ts-expect-error Scroll hosts must be elements or element refs.
Hooks.useScrollSpy({ scrollHost: { current: 'bad' } });
// @ts-expect-error Collapse requires an expanded state.
Hooks.useCollapse({});
// @ts-expect-error Generic list fields retain their inferred value types.
list[1].setItemProp(0, 'count', 'bad');
// @ts-expect-error Leading mode is a boolean.
Hooks.useDebouncedValue('text', 200, { leading: 'yes' });
