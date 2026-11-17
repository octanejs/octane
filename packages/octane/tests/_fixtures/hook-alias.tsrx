import { ReadingContext, useReading as readValue, useCell as cell } from './hook-alias-source.tsrx';

function Read() @{
	const value = readValue();
	<output>{value as string}</output>
}

export function ReadingApp({ value }: { value: string }) @{
	<ReadingContext value={value}>
		<Read />
	</ReadingContext>
}

export function Cells() @{
	const [a, setA] = cell(1);
	const [b, setB] = cell(10);
	<div>
		<output>{a + ':' + b}</output>
		<button class="a" onClick={() => setA(a + 1)}>
			{'a'}
		</button>
		<button class="b" onClick={() => setB(b + 1)}>
			{'b'}
		</button>
	</div>
}

export function GuardedCell({ shown }: { shown: boolean }) @{
	if (!shown) return null;
	const [count, setCount] = cell(1);
	<button class="guarded" onClick={() => setCount(count + 1)}>
		{count as number}
	</button>
}
