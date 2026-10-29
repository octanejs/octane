import type { MutableRefObject } from 'octane';
import {
	CSS,
	add,
	getEventCoordinates,
	getOwnerDocument,
	getWindow,
	isKeyboardEvent,
	subtract,
	useCombinedRefs,
	useEvent,
	useInterval,
	useLatestValue,
	useLazyMemo,
	useNodeRef,
	usePrevious,
	useUniqueId,
	type Coordinates,
	type Transform,
	type Transition,
} from '@octanejs/dnd-kit-utilities';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';

declare const event: Event;
declare const transform: Transform | null;
declare const count: number;

type _translate = Assert<Equal<ReturnType<typeof CSS.Translate.toString>, string | undefined>>;
type _transition = Assert<Equal<Parameters<typeof CSS.Transition.toString>[0], Transition>>;
const sum = add({ x: 1, y: 2 }, { x: 3 });
type _sum = Assert<Equal<typeof sum, { x: number; y: number }>>;
const difference = subtract({ x: 1, y: 2 }, { y: 1 });
type _difference = Assert<Equal<typeof difference, { x: number; y: number }>>;
type _coordinates = Assert<Equal<ReturnType<typeof getEventCoordinates>, Coordinates | null>>;
type _window = Assert<Equal<ReturnType<typeof getWindow>, typeof window>>;
type _document = Assert<Equal<ReturnType<typeof getOwnerDocument>, Document>>;
if (isKeyboardEvent(event)) {
	type _keyboard = Assert<Equal<typeof event, KeyboardEvent>>;
}

const combined = useCombinedRefs<HTMLElement | null>((node) => node?.focus());
type _combined = Assert<Equal<typeof combined, (node: HTMLElement | null) => void>>;
const handler = useEvent((value: number) => value * 2);
type _handler = Assert<Equal<typeof handler, (...args: any) => any>>;
const [setTimer, clearTimer] = useInterval();
type _setTimer = Assert<Equal<typeof setTimer, (listener: Function, duration: number) => void>>;
type _clearTimer = Assert<Equal<typeof clearTimer, () => void>>;
const latest = useLatestValue(transform);
type _latest = Assert<Equal<typeof latest, MutableRefObject<Transform | null>>>;
const lazy = useLazyMemo<number>((previous) => (previous ?? 0) + 1, []);
type _lazy = Assert<Equal<typeof lazy, number>>;
const [node, setNode] = useNodeRef();
type _node = Assert<Equal<typeof node, MutableRefObject<HTMLElement | null>>>;
type _setNode = Assert<Equal<typeof setNode, (element: HTMLElement | null) => void>>;
const previous = usePrevious(count);
type _previous = Assert<Equal<typeof previous, number | undefined>>;
const id = useUniqueId('item');
type _id = Assert<Equal<typeof id, string>>;

// @ts-expect-error a transform needs both scale factors
CSS.Transform.toString({ x: 1, y: 2 });
