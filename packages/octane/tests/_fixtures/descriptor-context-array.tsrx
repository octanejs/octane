import { createContext, memo, useContext, useState } from 'octane';

const Mode = createContext(false);
const content = {
	get tag() {
		return useContext(Mode) ? 'strong' : 'span';
	},
	get label() {
		return useContext(Mode) ? 'next' : 'first';
	},
	get riskyTag() {
		if (!useContext(Mode)) throw new Error('waiting');
		return 'strong';
	},
};

function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{String(count)}</button>
}

const nested = <content.tag data-child="nested">{content.label as string}</content.tag>;
const children = [nested, <input defaultValue="draft" />, <Counter />];
const shared = <section>{children}</section>;
const inspected = <section data-inspected-tag={nested.type}>
	<Counter />
</section>;
const risky = <content.riskyTag />;
const inspection = {
	get status() {
		try {
			return risky.type;
		} catch {
			return 'waiting';
		}
	},
};
const recovered = <section data-status={inspection.status}>
	<Counter />
</section>;

const PassThrough = memo(function PassThrough() {
	return shared;
});

function Later({ read }: { read: (() => void) | null }) {
	read?.();
	return null;
}

export function App({
	active,
	read = null,
	wrapped = false,
}: {
	active: boolean;
	read?: (() => void) | null;
	wrapped?: boolean;
}) @{
	<Mode.Provider value={active}>
		<main>
			{wrapped ? <PassThrough /> : shared}
			<Later read={read} />
		</main>
	</Mode.Provider>
}

export function Providers({ first, second }: { first: boolean; second: boolean }) @{
	<main>
		<Mode.Provider value={first}>{shared}</Mode.Provider>
		<Mode.Provider value={second}>{shared}</Mode.Provider>
	</main>
}

export function Inspection({ active }: { active: boolean }) @{
	<Mode.Provider value={active}>{inspected}</Mode.Provider>
}

export function RecoverInspection({ active }: { active: boolean }) @{
	<Mode.Provider value={active}>{recovered}</Mode.Provider>
}
