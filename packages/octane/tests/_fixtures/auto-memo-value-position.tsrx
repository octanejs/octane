import {
	Activity as ActivitySentinel,
	createContext,
	createElement,
	memo,
	type OctaneNode,
	startTransition,
	use,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from 'octane';

interface ValuePositionRow {
	id: number;
	label: string;
}

const ValuePositionTheme = createContext('initial');
const ValuePositionBoundaryContext = createContext('unrelated');
const Activity = ActivitySentinel as unknown as
	(props: {
		mode: 'hidden' | 'visible';
		children?: OctaneNode;
	}) => null;

function ValuePositionRowBody(props: ValuePositionRow) @{
	const theme = useContext(ValuePositionTheme);
	const [own, setOwn] = useState(0);
	<div class="memo-value-row" data-id={props.id}>
		<input class={'memo-value-input-' + props.id} defaultValue={props.label} />
		<button class={'memo-value-own-' + props.id} onClick={() => setOwn(own + 1)}>
			{theme + ':' + props.label + ':' + own}
		</button>
	</div>
}

const MemoValuePositionRow = memo(ValuePositionRowBody);

function buildValuePositionRows(items: ValuePositionRow[]) {
	return [
		createElement(MemoValuePositionRow, {
			key: items[0]!.id,
			id: items[0]!.id,
			label: items[0]!.label,
		}),
		createElement(MemoValuePositionRow, {
			key: items[1]!.id,
			id: items[1]!.id,
			label: items[1]!.label,
		}),
	];
}

export function CachedValuePositionRows() @{
	const [items, setItems] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const [theme, setTheme] = useState('initial');
	const [tick, setTick] = useState(0);
	const rows = buildValuePositionRows(items);
	<section>
		<button id="memo-value-tick" onClick={() => setTick(tick + 1)}>{tick as number}</button>
		<button id="memo-value-theme" onClick={() => setTheme(theme + '!')}>{'theme'}</button>
		<button
			id="memo-value-change"
			onClick={() => setItems([{ ...items[0]!, label: items[0]!.label + '!' }, items[1]!])}
		>{'change'}</button>
		<button
			id="memo-value-reorder"
			onClick={() => setItems([items[1]!, items[0]!])}
		>{'reorder'}</button>
		<ValuePositionTheme.Provider value={theme}>
			<div id="memo-value-rows">{rows}</div>
		</ValuePositionTheme.Provider>
	</section>
}

function ValuePositionMemoBoundaryBody(props: { items: ValuePositionRow[]; tick: number }) @{
	const items = props.items;
	const rows = buildValuePositionRows(items);
	<ValuePositionBoundaryContext.Provider value="unrelated">
		<div id="memo-value-boundary-rows" data-tick={props.tick}>{rows}</div>
	</ValuePositionBoundaryContext.Provider>
}

const MemoValuePositionBoundary = memo(ValuePositionMemoBoundaryBody);

export function CachedValuePositionMemoContext() @{
	const [items] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const [theme, setTheme] = useState('initial');
	const [tick, setTick] = useState(0);
	<section>
		<button
			id="memo-value-boundary-tick"
			onClick={() => setTick(tick + 1)}
		>{tick as number}</button>
		<button id="memo-value-boundary-theme" onClick={() => setTheme(theme + '!')}>{'theme'}</button>
		<ValuePositionTheme.Provider value={theme}>
			<MemoValuePositionBoundary items={items} tick={tick} />
		</ValuePositionTheme.Provider>
	</section>
}

function selectValuePositionOutput(
	rows: ReturnType<typeof buildValuePositionRows>,
	visible: boolean,
) {
	return visible ? rows : 'temporarily hidden';
}

export function CachedValuePositionRoundTrip() @{
	const [items] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const [visible, setVisible] = useState(true);
	const [theme, setTheme] = useState('initial');
	const stableRows = useMemo(() => buildValuePositionRows(items), [items]);
	const output = selectValuePositionOutput(stableRows, visible);
	<section>
		<button
			id="memo-value-round-trip-toggle"
			onClick={() => setVisible(!visible)}
		>{'toggle rows'}</button>
		<button
			id="memo-value-round-trip-theme"
			onClick={() => setTheme(theme + '!')}
		>{'change theme'}</button>
		<ValuePositionTheme.Provider value={theme}>
			<div id="memo-value-round-trip-rows">{output}</div>
		</ValuePositionTheme.Provider>
	</section>
}

export function EscapedValuePositionRows() @{
	const [items] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const [tick, setTick] = useState(0);
	const rows = buildValuePositionRows(items);
	<section>
		<button
			id="memo-value-mutate"
			onClick={() => {
				rows.reverse();
				setTick(tick + 1);
			}}
		>{tick as number}</button>
		<div id="memo-value-escaped-rows">{rows}</div>
	</section>
}

export function SetupEscapedValuePositionRows() @{
	const [items] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const [tick, setTick] = useState(0);
	const rows = buildValuePositionRows(items);
	const mutate = () => rows.reverse();
	<section>
		<button
			id="memo-value-setup-mutate"
			onClick={() => {
				mutate();
				setTick(tick + 1);
			}}
		>{tick as number}</button>
		<div id="memo-value-setup-rows">{rows}</div>
	</section>
}

const valuePositionActivityEffects: string[] = [];
const valuePositionLayoutEffects: string[] = [];

export function drainValuePositionActivityEffects(): string[] {
	return valuePositionActivityEffects.splice(0);
}

export function drainValuePositionLayoutEffects(): string[] {
	return valuePositionLayoutEffects.splice(0);
}

function ValuePositionEffectRow(props: ValuePositionRow) @{
	useLayoutEffect(() => {
		valuePositionLayoutEffects.push('mount:' + props.id);
		return () => {
			valuePositionLayoutEffects.push('cleanup:' + props.id);
		};
	}, [props.id]);
	useEffect(() => {
		valuePositionActivityEffects.push('mount:' + props.id);
		return () => {
			valuePositionActivityEffects.push('cleanup:' + props.id);
		};
	}, [props.id]);
	<span class="memo-value-activity-row">{props.label as string}</span>
}

const MemoValuePositionEffectRow = memo(ValuePositionEffectRow);

function buildValuePositionEffectRows(items: ValuePositionRow[]) {
	return [
		createElement(MemoValuePositionEffectRow, {
			key: items[0]!.id,
			id: items[0]!.id,
			label: items[0]!.label,
		}),
		createElement(MemoValuePositionEffectRow, {
			key: items[1]!.id,
			id: items[1]!.id,
			label: items[1]!.label,
		}),
	];
}

export function CachedValuePositionActivity(props: { mode: 'visible' | 'hidden' }) @{
	const [items, setItems] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const rows = buildValuePositionEffectRows(items);
	<section>
		<button
			id="memo-value-activity-reorder"
			onClick={() => setItems([items[1]!, items[0]!])}
		>{'reorder'}</button>
		<Activity mode={props.mode}>
			<ValuePositionTheme.Provider value="initial">
				<div id="memo-value-activity-rows">{rows}</div>
			</ValuePositionTheme.Provider>
		</Activity>
	</section>
}

function ValuePositionSuspender(props: { promise: PromiseLike<string> }) @{
	const value = use(props.promise);
	<span id="memo-value-suspense-detail">{value as string}</span>
}

export function CachedValuePositionSuspense(props: { promise: PromiseLike<string> }) @{
	const [items] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const rows = buildValuePositionEffectRows(items);
	<section>
		@try {
			<>
				<ValuePositionTheme.Provider value="initial">
					<div id="memo-value-suspense-rows">{rows}</div>
				</ValuePositionTheme.Provider>
				<ValuePositionSuspender promise={props.promise} />
			</>
		} @pending {
			<span id="memo-value-suspense-pending">{'loading'}</span>
		}
	</section>
}

export function CachedValuePositionTransition(props: {
	initialPromise: PromiseLike<string>;
	nextPromise: PromiseLike<string>;
}) @{
	const [items, setItems] = useState<ValuePositionRow[]>([
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
	]);
	const [resource, setResource] = useState(props.initialPromise);
	const rows = buildValuePositionRows(items);
	<section>
		<button
			id="memo-value-transition-bump"
			onClick={() => startTransition(() => {
				setItems([
					{ id: 2, label: 'pending second' },
					{ id: 1, label: 'pending first' },
				]);
				setResource(props.nextPromise);
			})}
		>{'start transition'}</button>
		<button
			id="memo-value-transition-urgent"
			onClick={() => setItems([
				{ id: 2, label: 'urgent second' },
				{ id: 1, label: 'urgent first' },
			])}
		>{'update urgently'}</button>
		@try {
			<>
				<ValuePositionTheme.Provider value="initial">
					<div id="memo-value-transition-rows">{rows}</div>
				</ValuePositionTheme.Provider>
				<ValuePositionSuspender promise={resource} />
			</>
		} @pending {
			<span id="memo-value-transition-pending">{'loading'}</span>
		}
	</section>
}
