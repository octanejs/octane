'use strong';

import {
	createContext,
	use,
	useContext,
	useContext as readContext,
	useLayoutEffect,
	useState,
} from 'octane';
import * as OctaneHooks from 'octane';

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

const useConstStrongTheme = (context: typeof StrongTheme): string => {
	return useConstStrongThemeInner(context);
};

const useConstStrongThemeInner = function (context: typeof StrongTheme): string {
	return useContext(context);
};

export function StrongConstCustomHookContextRows() @{
	const [theme, setTheme] = useState('first');
	const [items] = useState([{ id: 1 }, { id: 2 }]);
	<div>
		<button id="strong-const-hook-context-update" onClick={() => setTheme('second')}>
			update
		</button>
		<StrongTheme.Provider value={theme}>
			@for (const item of items.slice(); key item.id) {
				const value = useConstStrongTheme(StrongTheme);
				<span class="strong-const-hook-context-row">{value as string}</span>
			}
		</StrongTheme.Provider>
	</div>
}

function useOptionalStrongTheme(context: typeof StrongTheme): string {
	return readContext?.(context) as string;
}

export function StrongOptionalAliasedContextRows() @{
	const [theme, setTheme] = useState('first');
	const [items] = useState([{ id: 1 }, { id: 2 }]);
	<div>
		<button id="strong-optional-context-update" onClick={() => setTheme('second')}>
			update
		</button>
		<StrongTheme.Provider value={theme}>
			@for (const item of items.slice(); key item.id) {
				const directValue = useContext?.(StrongTheme);
				const value = readContext?.(StrongTheme);
				const customValue = useOptionalStrongTheme?.(StrongTheme);
				const namespaceValue = (OctaneHooks as any)['useContext' as string]?.(StrongTheme);
				<span class="strong-optional-context-pair">
					<span class="strong-optional-direct-context-row">{directValue as string}</span>
					<span class="strong-optional-context-row">{value as string}</span>
					<span class="strong-optional-custom-context-row">{customValue as string}</span>
					<span class="strong-optional-namespace-context-row">{namespaceValue as string}</span>
				</span>
			}
		</StrongTheme.Provider>
	</div>
}

export function StrongOptionalNamespaceContextRows() @{
	const [theme, setTheme] = useState('first');
	const [items] = useState([{ id: 1 }, { id: 2 }]);
	<div>
		<button id="strong-optional-namespace-context-update" onClick={() => setTheme('second')}>
			update
		</button>
		<StrongTheme.Provider value={theme}>
			@for (const item of items.slice(); key item.id) {
				const value = (OctaneHooks as any)['useContext' as string]?.(StrongTheme);
				<span class="strong-optional-namespace-only-context-row">{value as string}</span>
			}
		</StrongTheme.Provider>
	</div>
}

function useCycleA(context: typeof StrongTheme, depth: number): string {
	if (depth === 0) return useCycleB(context, 1);
	if (depth === 1) return useCycleC(context, 2);
	return useContext(context);
}

function useCycleB(context: typeof StrongTheme, depth: number): string {
	return useCycleA(context, depth);
}

function useCycleC(context: typeof StrongTheme, depth: number): string {
	return useCycleA(context, depth);
}

function StrongCycleReaderA(props: { context: typeof StrongTheme }) @{
	const value = useCycleA(props.context, 0);
	<span id="strong-cycle-reader-a">{value as string}</span>
}

function StrongCycleReaderC(props: { context: typeof StrongTheme }) @{
	const value = useCycleC(props.context, 0);
	<span id="strong-cycle-reader-c">{value as string}</span>
}

export function StrongCyclicContextReaders() @{
	const [theme, setTheme] = useState('first');
	<div>
		<button id="strong-cycle-context-update" onClick={() => setTheme('second')}>
			update
		</button>
		<StrongTheme.Provider value={theme}>
			<StrongCycleReaderA context={StrongTheme} />
			<StrongCycleReaderC context={StrongTheme} />
		</StrongTheme.Provider>
	</div>
}

function useShadowedTheme(context: typeof StrongTheme): string {
	return useContext(context);
}

function unrelatedShadowAssignment(): number {
	let useShadowedTheme = 0;
	useShadowedTheme = 1;
	return useShadowedTheme;
}

export function StrongShadowedAssignmentContextRows() @{
	const [theme, setTheme] = useState('first');
	const [items] = useState([{ id: 1 }]);
	<div>
		<button id="strong-shadow-context-update" onClick={() => setTheme('second')}>
			update
		</button>
		<StrongTheme.Provider value={theme}>
			@for (const item of items.slice(); key item.id) {
				const value = useShadowedTheme(StrongTheme);
				<span class="strong-shadow-context-row">{value as string}</span>
			}
		</StrongTheme.Provider>
	</div>
}

export interface StrongNumberProjectorConstructor {
	new (value: number): { result: string };
}

export function StrongSignedZeroConstructedProp(props: {
	Projector: StrongNumberProjectorConstructor;
	value: number;
}) @{
	<DependencyLeaf
		id="strong-signed-zero-constructor"
		value={new props.Projector(props.value).result}
	/>
}

function StrongSignedZeroListChild(props: {
	Projector: StrongNumberProjectorConstructor;
	value: number;
}) @{
	<span
		class="strong-signed-zero-list-child"
	>{new props.Projector(props.value).result as string}</span>
}

export function StrongSignedZeroListProjections({
	items,
	Projector,
	value,
}: {
	items: readonly { id: number }[];
	Projector: StrongNumberProjectorConstructor;
	value: number;
}) @{
	<div>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					<StrongSignedZeroListChild Projector={Projector} value={value} />
				</li>
			}
		</ul>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					<span
						class="strong-signed-zero-list-inline"
					>{new Projector(value).result as string}</span>
				</li>
			}
		</ul>
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
