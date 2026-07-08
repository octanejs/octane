import { createContext } from 'octane';
import {
	Provider,
	useSelector,
	useDispatch,
	useStore,
	createSelectorHook,
	createDispatchHook,
	shallowEqual,
} from '@octanejs/redux';

// Conformance fixtures — octane-side behavior of the binding.

// Render-count probe: a component selecting ONE slice must not re-render when
// an UNRELATED slice changes (the with-selector memoization contract).
export const renders = { a: 0, b: 0 };

function SliceA() @{
	renders.a++;
	const a = useSelector((s: any) => s.a);
	<span id="a">
		{'a=' + a}
	</span>
}

function SliceB() @{
	renders.b++;
	const b = useSelector((s: any) => s.b);
	<span id="b">
		{'b=' + b}
	</span>
}

function EqualityReader() @{
	// Fresh object every call — only shallowEqual keeps it from re-rendering.
	const pair = useSelector((s: any) => ({ a: s.a }), shallowEqual);
	<span id="pair">
		{'pair=' + pair.a}
	</span>
}

export function SlicesApp(props: { store: unknown }) @{
	<Provider store={props.store}>
		<SliceA />
		<SliceB />
		<EqualityReader />
	</Provider>
}

// useStore/useDispatch identity probes.
export const captured: { store: unknown; dispatch: unknown }[] = [];

function CaptureHooks() @{
	const store = useStore();
	const dispatch = useDispatch();
	captured.push({ store, dispatch });
	<span id="cap">{'captured'}</span>
}

export function CaptureApp(props: { store: unknown }) @{
	<Provider store={props.store}>
		<CaptureHooks />
	</Provider>
}

// Custom context via the create*Hook factories (the recharts pattern): an
// ISOLATED store on its own context, so the default-context Provider/hooks are
// untouched by it.
export const IsolatedContext = createContext(null);
const useIsolatedSelector = createSelectorHook(IsolatedContext as any);
const useIsolatedDispatch = createDispatchHook(IsolatedContext as any);

function IsolatedReader() @{
	const value = useIsolatedSelector((s: any) => s.isolated);
	const outer = useSelector((s: any) => s.a);
	useIsolatedDispatch();
	<span id="iso">
		{'isolated=' + value + ' outer=' + outer}
	</span>
}

export function NestedContextsApp(props: { outerStore: unknown; innerStore: unknown }) @{
	<Provider store={props.outerStore}>
		<Provider store={props.innerStore} context={IsolatedContext}>
			<IsolatedReader />
		</Provider>
	</Provider>
}

// Out-of-Provider read — must throw (dev parity with react-redux).
export function NoProviderApp() @{
	<NoProviderReader />
}

function NoProviderReader() @{
	const v = useSelector((s: any) => s);
	<span>{String(v)}</span>
}
