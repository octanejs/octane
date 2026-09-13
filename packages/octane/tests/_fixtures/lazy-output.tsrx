import { useLayoutEffect, useMemo, useState } from 'octane';

function Label({ text }) @{
	<span>{text as string}</span>
}

function Counter({ log }) @{
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		log('mount');
		return () => log('unmount');
	}, []);
	<button onClick={() => setCount(count + 1)}>{String(count)}</button>
}

export function First({ log }) @{
	const memo = useMemo(() => ({ text: 'first' }), []);
	<div>
		<input defaultValue="draft" />
		<Label text={memo.text} />
		<Counter log={log} />
	</div>
}

export function Second({ log }) @{
	const memo = useMemo(() => ({ text: 'second' }), []);
	<div>
		<input defaultValue="draft" />
		<Label text={memo.text} />
		<Counter log={log} />
	</div>
}

export function Shell({ Lazy, log, read }) @{
	<section>
		<Lazy log={log} />
		<p>{read() as string}</p>
	</section>
}

export function Dynamic({ text }) @{
	<span>{text as string}</span>
}

export function PropShell({ Lazy, text }) @{
	<section>
		<Lazy text={text} />
	</section>
}

export function DescriptorShell({ child, read }) @{
	<section>
		{child}
		<p>{read() as string}</p>
	</section>
}
