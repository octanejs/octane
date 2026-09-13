import { createContext, useContext, useState } from 'octane';

const Mode = createContext(false);

function Stateful() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{String(count)}</button>
}

const content = {
	get label() {
		return String(useContext(Mode));
	},
	get current() {
		return useContext(Mode) ? <Stateful /> : <span>plain</span>;
	},
};

// One descriptor identity resolves to different child kinds under each Provider.
const shared = <section>
	<input defaultValue="draft" />
	{content.current}
</section>;

const sharedRecord = <section data-mode={content.label}>
	<input defaultValue="draft" />
	{content.current}
</section>;

function Later({ read }) {
	read?.();
	return null;
}

export function App({ first, second, read = null, complete = false }) @{
	const descriptor = complete ? sharedRecord : shared;
	<main>
		<Mode.Provider value={first}>{descriptor}</Mode.Provider>
		<Mode.Provider value={second}>{descriptor}</Mode.Provider>
		<Later read={read} />
	</main>
}
