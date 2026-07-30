import { useMap } from '@octanejs/usehooks-ts';

const [map, actions] = useMap<string, number>([['one', 1]]);

const size: number = map.size;
const value: number | undefined = map.get('one');
const hasValue: boolean = map.has('one');
const entries: MapIterator<[string, number]> = map.entries();
void [size, value, hasValue, entries];

actions.set('two', 2);
actions.setAll([['three', 3]]);
actions.remove('one');
actions.reset();

// @ts-expect-error map mutation must go through actions.set
map.set('two', 2);
// @ts-expect-error map mutation must go through actions.remove
map.delete('one');
// @ts-expect-error map mutation must go through actions.reset
map.clear();
