import { useMemo, useState } from 'octane';

export function Label({ text }) @{
	<span>{text}</span>
}

export function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{String(count)}</button>
}

export function First() @{
	const memo = useMemo(() => ({ text: 'first' }), []);
	<div>
		<input defaultValue="draft" />
		<Label text={memo.text} />
		<Counter />
	</div>
}

export function Second() @{
	const memo = useMemo(() => ({ text: 'second' }), []);
	<div>
		<input defaultValue="draft" />
		<Label text={memo.text} />
		<Counter />
	</div>
}

export function Shell({ Context, children, read }) @{
	<section>
		<Context.Provider value="value" children={children} />
		<p>{read()}</p>
	</section>
}

export function Inline({ Context, text, onClick }) @{
	<Context.Provider value={text}>
		<div>
			<input defaultValue="draft" />
			<Label text={text} />
			<Counter />
			<a onClick={onClick}>capture</a>
		</div>
	</Context.Provider>
}
