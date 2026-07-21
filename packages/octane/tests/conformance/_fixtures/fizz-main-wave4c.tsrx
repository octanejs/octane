import {
	createContext,
	createElement,
	lazy,
	Suspense,
	use,
	useActionState,
	useState,
} from 'octane';

export function SyncThenableBoundary(props) @{
	<section id="sync-thenable-boundary">
		@try {
			const value = use(props.thenable);
			<strong id="sync-thenable-value">{value as string}</strong>
		} @pending {
			<i id="sync-thenable-fallback">{'loading'}</i>
		}
	</section>
}

export function IterableChildren(props) @{
	<ul id="iterable-children">{props.items}</ul>
}

function* GeneratorComponent() {
	yield createElement('h1', { id: 'generator-component-first', key: 'first' }, 'Hello');
	yield createElement('h1', { id: 'generator-component-second', key: 'second' }, 'World');
}

export function GeneratorComponentOutput() @{
	<section id="generator-component-output">
		<GeneratorComponent />
	</section>
}

export function CustomElementChildren() @{
	<my-element id="custom-element-children">
		<div id="custom-element-child">{'foo'}</div>
	</my-element>
}

function NestedUse(props) @{
	const c = use(props.c);
	const d = use(props.d);
	<span id="nested-use-values">{c + d as string}</span>
}

function ParentUse(props) @{
	const a = use(props.a);
	const b = use(props.b);
	<div id="parent-use-values">
		{a + b as string}
		<NestedUse c={props.c} d={props.d} />
	</div>
}

export function MultipleUseValues(props) @{
	<Suspense fallback={<i id="multiple-use-fallback">loading</i>}>
		<ParentUse a={props.a} b={props.b} c={props.c} d={props.d} />
	</Suspense>
}

let lazyModule;

export function setLazyUseModule(modulePromise) {
	lazyModule = modulePromise;
}

export function LazyUseLeaf(props) @{
	const value = use(props.promise);
	<span id="lazy-use-second">{value as string}</span>
}

const LazyUseLeafModule = lazy(() => lazyModule);

function LazyUseContent(props) @{
	const first = use(props.first);
	<div id="lazy-use-first">
		{first as string}
		<LazyUseLeafModule promise={props.second} />
	</div>
}

export function LazyUseIsolation(props) @{
	<Suspense fallback={<i id="lazy-use-fallback">loading</i>}>
		<LazyUseContent first={props.first} second={props.second} />
	</Suspense>
}

let rejectingLazyModule;

export function setRejectingLazyModule(modulePromise) {
	rejectingLazyModule = modulePromise;
}

const RejectingLazy = lazy(() => rejectingLazyModule);

export function LazyRejectionBoundary() @{
	@try {
		<RejectingLazy />
	} @pending {
		<i id="lazy-rejection-fallback">{'loading'}</i>
	} @catch (error) {
		<strong id="lazy-rejection-error">{error.message as string}</strong>
	}
}

const RecoveryContext = createContext('default');

function ThrowContextError(props) {
	throw props.error;
}

function ResolvedAfterFatal(props) @{
	props.onRender();
	<span id="resolved-after-fatal">{props.value as string}</span>
}

export function PendingThenFatal(props) @{
	<>
		@try {
			const value = use(props.promise);
			<ResolvedAfterFatal value={value} onRender={props.onRender} />
		} @pending {
			<i id="pending-before-fatal">{'loading'}</i>
		}
		<ThrowContextError error={props.error} />
	</>
}

function ReadRecoveryContext(props) @{
	const value = use(RecoveryContext);
	<span id={props.id}>{value}</span>
}

export function ContextErrorRecovery(props) @{
	<>
		<RecoveryContext.Provider value="outer">
			@try {
				<RecoveryContext.Provider value="inner">
					<ThrowContextError error={props.error} />
				</RecoveryContext.Provider>
			} @catch (error) {
				<b id="context-error">{error.message as string}</b>
			}
			<ReadRecoveryContext id="context-after-error" />
		</RecoveryContext.Provider>
		<ReadRecoveryContext id="context-outside-provider" />
	</>
}

export function ActionStateRenderReplay(props) @{
	const [localState, setLocalState] = useState(0);
	if (localState < 3) setLocalState(localState + 1);
	const [actionState] = useActionState(props.action, 0);
	<section id="action-state-replay">
		@try {
			const label = use(props.promise);
			<strong id="action-state-value">{label + ':' + actionState + ':' +
				localState as string}</strong>
		} @pending {
			<i id="action-state-fallback">{'loading'}</i>
		}
	</section>
}

export function RawStyle(props) @{
	const Tag = props.tag;
	<Tag dangerouslySetInnerHTML={{ __html: props.source }} />
}

export function RawScript(props) @{
	<script dangerouslySetInnerHTML={{ __html: props.source }} />
}
