/** @jsxImportSource octane */
// Server-compiled twins of the upstream suite's SSR components
// (upstream/test/index.test.tsx). Each factory holds one case's components as
// upstream declares them, inside a function, so they compile to the markup the
// client components hydrate; the case's atom is the factory's parameter.
import type * as Atom from 'effect/reactivity/Atom';
import { Suspense, type ComponentType, type OctaneNode } from 'octane';
import { useAtomValue } from '../../src/index.ts';

/** "should run atom's during SSR by default". */
export function ssrByDefault(counterAtom: Atom.Atom<number>) {
	function TestComponent() {
		const count = useAtomValue(counterAtom);
		return <div>{count}</div>;
	}

	function App() {
		return <TestComponent />;
	}

	return { App };
}

/** "hydrates a delayed Suspense boundary after the atom changes". */
export function delayedBoundary(userAtom: Atom.Atom<string>) {
	function Name({ id }: { id: string }) {
		const user = useAtomValue(userAtom, (name) => ({ name: name.toUpperCase() }));
		return <span id={id}>{user.name}</span>;
	}

	const Passthrough = ({ children }: { children?: OctaneNode }) => <>{children}</>;

	function App({ Panel }: { Panel: ComponentType<{ children?: OctaneNode }> }) {
		return (
			<div>
				<Name id="header" />
				<Suspense fallback={<span>...</span>}>
					<Panel>
						<Name id="panel" />
					</Panel>
				</Suspense>
			</div>
		);
	}

	return { App, Passthrough };
}

/** "keeps the hydrated value until the last reader unmounts". */
export function lastReader(userAtom: Atom.Atom<string>) {
	function Name() {
		return <span>{useAtomValue(userAtom)}</span>;
	}

	return { Name };
}

/** "should not execute Atom effects during SSR when using withServerSnapshot". */
export function serverValueInitial(userDataAtom: Atom.Atom<{ readonly _tag: string }>) {
	function TestComponent() {
		const result = useAtomValue(userDataAtom);

		return <div>{result._tag}</div>;
	}

	function App() {
		return <TestComponent />;
	}

	return { App };
}
