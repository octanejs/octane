// Octane probes for the differential lane. tests/differential/parity.test.ts
// builds the same components over the pinned React source; each renders its
// hook's value as text and reports what a caller would hold on to.
import type * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import type * as AtomRef from 'effect/reactivity/AtomRef';
import type * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { Suspense, useContext, type ComponentType } from 'octane';
import {
	RegistryContext,
	RegistryProvider,
	useAtom,
	useAtomInitialValues,
	useAtomMount,
	useAtomRefProp,
	useAtomRefPropValue,
	useAtomRefresh,
	useAtomSet,
	useAtomSubscribe,
	useAtomSuspense,
	useAtomValue,
} from '../../src/index.ts';

type Report = (value: any) => void;

export function InRegistry({
	registry,
	probe: Probe,
	props,
}: {
	registry: AtomRegistry.AtomRegistry;
	probe: ComponentType<any>;
	props: object;
}) {
	return (
		<RegistryContext value={registry}>
			<Probe {...props} />
		</RegistryContext>
	);
}

export function UseAtom({ atom, report }: { atom: Atom.Writable<number>; report: Report }) {
	const [value, set] = useAtom(atom);
	report(set);
	return <span>{String(value)}</span>;
}

export function UseAtomSet({
	atom,
	mode,
	report,
}: {
	atom: Atom.Writable<any, any>;
	mode: 'promise' | 'promiseExit';
	report: Report;
}) {
	report(useAtomSet(atom, { mode }));
	return <span>{String(useAtomValue(atom)._tag)}</span>;
}

export function UseAtomMount({ atom }: { atom: Atom.Atom<unknown> }) {
	useAtomMount(atom);
	return null;
}

export function UseAtomRefresh({ atom, report }: { atom: Atom.Atom<number>; report: Report }) {
	report(useAtomRefresh(atom));
	return <span>{String(useAtomValue(atom))}</span>;
}

export function UseAtomSubscribe({
	atom,
	f,
	immediate,
}: {
	atom: Atom.Atom<number>;
	f: (value: number) => void;
	immediate: boolean;
}) {
	useAtomSubscribe(atom, f, { immediate });
	return null;
}

export function UseAtomInitialValues({
	atom,
	value,
}: {
	atom: Atom.Writable<number>;
	value: number;
}) {
	useAtomInitialValues([[atom, value]]);
	return <span>{String(useAtomValue(atom))}</span>;
}

export function UseAtomRefProp({
	source,
	report,
}: {
	source: AtomRef.AtomRef<{ readonly count: number; readonly label: string }>;
	report: Report;
}) {
	report(useAtomRefProp(source, 'count'));
	return (
		<span>
			{useAtomRefPropValue(source, 'label') + ':' + String(useAtomRefPropValue(source, 'count'))}
		</span>
	);
}

function ProvidedValue({ atom, report }: { atom: Atom.Atom<number>; report: Report }) {
	report(useContext(RegistryContext));
	return <span>{String(useAtomValue(atom))}</span>;
}

export function Provider({
	atom,
	value,
	scheduleTask,
	report,
}: {
	atom: Atom.Writable<number>;
	value: number;
	scheduleTask: (f: () => void) => () => void;
	report: Report;
}) {
	return (
		<RegistryProvider initialValues={[[atom, value]]} scheduleTask={scheduleTask}>
			<ProvidedValue atom={atom} report={report} />
		</RegistryProvider>
	);
}

function SuspendedResult({
	atom,
	suspendOnWaiting,
}: {
	atom: Atom.Atom<AsyncResult.AsyncResult<number, string>>;
	suspendOnWaiting: boolean;
}) {
	const result = useAtomSuspense(atom, { suspendOnWaiting, includeFailure: true });
	return (
		<span>
			{result._tag +
				':' +
				String(result._tag === 'Success' ? result.value : '') +
				':' +
				String(result.waiting)}
		</span>
	);
}

export function UseAtomSuspense(props: {
	atom: Atom.Atom<AsyncResult.AsyncResult<number, string>>;
	suspendOnWaiting: boolean;
}) {
	return (
		<Suspense fallback={<span>{'fallback'}</span>}>
			<SuspendedResult {...props} />
		</Suspense>
	);
}
