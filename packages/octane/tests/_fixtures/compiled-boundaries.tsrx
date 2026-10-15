import {
	CompiledContext,
	CompiledOutlet,
	createCompiledContext,
	createContext,
	use,
	useContext,
	useLayoutEffect,
	useState,
} from 'octane';

export const Tone = createCompiledContext('default');
export const Ordinary = createContext('ordinary');

export function Screen(props: { label: string; log: (message: string) => void }) @{
	const [count, setCount] = useState(0);
	const tone = useContext(Tone);
	useLayoutEffect(() => {
		props.log('mount');
		return () => props.log('cleanup');
	}, []);
	<article>
		<button onClick={() => setCount(count + 1)}>{props.label + ':' + tone + ':' + count}</button>
		<input />
	</article>
}

export function Other(props: { label: string }) @{
	<aside>{props.label + ':' + useContext(Tone)}</aside>
}

export function Shell(props: {
	component: typeof Screen;
	label: string;
	tone: string;
	id: string;
	log: (message: string) => void;
}) @{
	<main>
		<CompiledContext context={Tone} value={props.tone}>
			<CompiledOutlet key={props.id} component={props.component} props={props} />
		</CompiledContext>
		<footer>tail</footer>
	</main>
}

export function CatchShell(props: { component: (props: object) => unknown }) @{
	<main>
		@try {
			<CompiledOutlet component={props.component} props={{}} />
		} @catch (error) {
			<p role="alert">{String(error)}</p>
		}
	</main>
}

export function OrdinaryShell(props: { component: () => any }) @{
	const Component = props.component;
	<Ordinary value="provided">
		<Component />
	</Ordinary>
}

function MixedRoute(props: { component: () => any }) @{
	const Component = props.component;
	<section>
		<Component />
	</section>
}

export function MixedOutletShell(props: { component: () => any }) @{
	<main>
		<CompiledOutlet component={MixedRoute} props={props} />
		<OrdinaryShell component={props.component} />
	</main>
}

export function Shadowed(props: { replacement: () => any }) @{
	const CompiledOutlet = props.replacement;
	<main>
		<CompiledOutlet />
	</main>
}

export function CheckedProvider(props: { children: unknown }) @{
	<CompiledContext context={Tone} value="provided" children={props.children} />
}

function GateProvider(props: { show: boolean; children: unknown }) @{
	<CompiledContext context={Tone} value="gated" children={props.show ? props.children : null} />
}

function Suspends(props: { resource: Promise<unknown> }) @{
	use(props.resource);
	<i />
}

export function GatedShell(props: {
	show: boolean;
	log: (message: string) => void;
	resource?: Promise<unknown>;
}) @{
	<main>
		<GateProvider show={props.show}>
			<Screen label="screen" log={props.log} />
		</GateProvider>
		@if (!props.show && props.resource) {
			<Suspends resource={props.resource} />
		}
		<footer>tail</footer>
	</main>
}

export function PendingShell(props: { component: typeof Other; label: string }) @{
	<CompiledContext context={Tone} value="ready">
		@try {
			<CompiledOutlet component={props.component} props={{ label: props.label }} />
		} @pending {
			<p role="status">loading</p>
		}
	</CompiledContext>
}
