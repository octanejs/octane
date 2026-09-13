import { createContext, useContext, useState } from 'octane';

const Mode = createContext({ active: false, kind: 'tag' });
const shape = {
	get tag() {
		return useContext(Mode).active ? 'aside' : 'div';
	},
	get key() {
		return useContext(Mode).active ? 'new' : 'old';
	},
	get left() {
		return useContext(Mode).active ? 'b' : 'a';
	},
	get right() {
		return useContext(Mode).active ? 'a' : 'b';
	},
};

function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{String(count)}</button>
}

const changingTag = <shape.tag data-changing="tag" />;
const changingKey = <input key={shape.key} data-changing="key" defaultValue="nested" />;
const left = <input key={shape.left} data-position="left" defaultValue="left" />;
const right = <input key={shape.right} data-position="right" defaultValue="right" />;
const pair = [left, right];
Object.defineProperty(pair, 0, { get: () => left });
pair.slice = () => {
	throw new Error('authored slice must not be called');
};

const content = {
	get current() {
		const { active, kind } = useContext(Mode);
		return [
			null,
			'prefix',
			kind === 'tag'
				? changingTag
				: kind === 'key'
					? changingKey
					: pair,
			false,
			<input data-stable="true" defaultValue="draft" />,
			active ? <Counter /> : <span>plain</span>,
		];
	},
};
const shared = <section>{content.current}</section>;

function Later({ read }) {
	read?.();
	return null;
}

export function App({ active, kind, read = null }) @{
	<Mode.Provider value={{ active, kind }}>
		<main>
			{shared}
			<Later read={read} />
		</main>
	</Mode.Provider>
}
