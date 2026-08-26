'use strong';

import {
	createContext,
	use,
	useContext,
	useContext as readContext,
	useLayoutEffect,
	useState,
} from 'octane';

export interface SnapshotRow {
	id: number;
	label: string;
	read(prefix: string): string;
}

export interface SnapshotListProps {
	items: SnapshotRow[];
	prefix: string;
	onSelect: (item: SnapshotRow) => void;
}

interface SnapshotCalculationProps {
	item: SnapshotRow;
	prefix: string;
	formatter: { read(item: SnapshotRow, prefix: string): string };
}

function readSnapshot({ formatter, item, prefix }: SnapshotCalculationProps) {
	return formatter.read(item, prefix);
}

export function SnapshotCalculation({ formatter, item, prefix }: SnapshotCalculationProps) @{
	const label = formatter.read(item, prefix);
	<p>{label as string}</p>
}

export function WrappedSnapshotCalculation(props: SnapshotCalculationProps) @{
	const label = readSnapshot(props);
	<p>{label as string}</p>
}

export function SnapshotMethodList({ items, prefix, onSelect }: SnapshotListProps) @{
	<ul>
		@for (const item of items; key item.id) {
			<li data-id={item.id}>
				<span class="snapshot-label">{item.read(prefix) as string}</span>
				<input defaultValue={item.label} />
				<button onClick={() => onSelect(item)}>select</button>
			</li>
		} @empty {
			<li class="snapshot-empty">{prefix + 'empty'}</li>
		}
	</ul>
}

// Keep the reported callback shape: it deliberately closes over this render's
// items snapshot, so an append must refresh handlers on surviving rows.
export function CapturedSnapshotList() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'apple' },
		{ id: 2, label: 'banana' },
		{ id: 3, label: 'cherry' },
	]);
	const [nextId, setNextId] = useState(4);
	const add = (position: 'start' | 'end') => {
		const item = { id: nextId, label: 'item ' + nextId };
		setNextId(nextId + 1);
		setItems(position === 'start' ? [item, ...items] : [...items, item]);
	};
	<div>
		<button id="captured-prepend" onClick={() => add('start')}>prepend</button>
		<button id="captured-append" onClick={() => add('end')}>append</button>
		<button id="captured-reverse" onClick={() => setItems([...items].reverse())}>reverse</button>
		<button id="captured-clear" onClick={() => setItems([])}>clear</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class="captured-row" data-id={item.id}>
					<span>{item.label as string}</span>
					{console.log('eval:', item.id)}
					<button onClick={() => setItems(items.filter((entry) => entry.id !== item.id))}>
						remove
					</button>
				</li>
			} @empty {
				<li class="captured-empty">Empty</li>
			}
		</ul>
	</div>
}

interface DependencyLeafProps {
	id: string;
	value: string;
}

function DependencyLeaf({ id, value }: DependencyLeafProps) @{
	<span id={id}>{value}</span>
}

export function StrongMapJoinProp(props: {
	items: string[];
	project: (value: string) => string;
}) @{
	<DependencyLeaf id="strong-map-join" value={props.items.map(props.project).join(',')} />
}

export function StrongFactoryReadProp(props: {
	factory: () => { read(value: string): string };
	value: string;
}) @{
	<DependencyLeaf id="strong-factory-read" value={props.factory().read(props.value)} />
}

export interface StrongProjector {
	result: string;
}

export interface StrongProjectorConstructor {
	new (value: string): StrongProjector;
}

export function StrongConstructedResultProp(props: {
	Projector: StrongProjectorConstructor;
	value: string;
}) @{
	<DependencyLeaf id="strong-constructed-result" value={new props.Projector(props.value).result} />
}

interface StrongCallableDependenciesProps {
	value: string;
	format: (value: string) => string;
	tagger: {
		prefix: string;
		make(): (value: string) => string;
	};
	template: {
		prefix: string;
		tag(strings: TemplateStringsArray, value: string): string;
	};
}

export function StrongCallableDependencies(props: StrongCallableDependenciesProps) @{
	<div>
		<DependencyLeaf id="strong-call" value={props.format.call(null, props.value)} />
		<DependencyLeaf id="strong-apply" value={props.format.apply(null, [props.value])} />
		<DependencyLeaf id="strong-bind" value={props.format.bind(null)(props.value)} />
		<DependencyLeaf id="strong-produced-callee" value={props.tagger.make()(props.value)} />
		<DependencyLeaf id="strong-tag" value={props.template.tag`${props.value}`} />
	</div>
}

export const StrongTheme = createContext('first');

function useStrongTheme(context: typeof StrongTheme): string {
	return useContext(context);
}

function StrongThemeChild(props: { context: typeof StrongTheme }) @{
	const theme = useStrongTheme(props.context);
	<span id="strong-custom-hook-context">{theme as string}</span>
}

export function StrongCustomHookContext(props: { context: typeof StrongTheme }) @{
	<StrongThemeChild context={props.context} />
}

export function StrongAliasedContextRows() @{
	const [theme, setTheme] = useState('first');
	const [items] = useState([{ id: 1 }, { id: 2 }]);
	<div>
		<button id="strong-aliased-context-update" onClick={() => setTheme('second')}>
			update
		</button>
		<StrongTheme.Provider value={theme}>
			@for (const item of items.slice(); key item.id) {
				const value = readContext(StrongTheme);
				<span class="strong-aliased-context-row">{value as string}</span>
			}
		</StrongTheme.Provider>
	</div>
}

function StrongLayoutEffectChild(props: { log: string[] }) @{
	useLayoutEffect(() => {
		props.log.push('create');
		return () => {
			props.log.push('destroy');
		};
	}, [props.log]);
	<span id="strong-layout-effect-child">content</span>
}

function StrongAsyncChild(props: { promise: PromiseLike<string> }) @{
	const value = use(props.promise);
	<span id="strong-async-child">{value as string}</span>
}

export function StrongSuspenseLayoutEffect(props: {
	promise: PromiseLike<string>;
	log: string[];
	bind: (show: () => void) => void;
}) @{
	const [show, setShow] = useState(false);
	props.bind(() => setShow(true));
	@try {
		<>
			<StrongLayoutEffectChild log={props.log} />
			@if (show) {
				<StrongAsyncChild promise={props.promise} />
			}
		</>
	} @pending {
		<span id="strong-layout-effect-pending">pending</span>
	}
}
