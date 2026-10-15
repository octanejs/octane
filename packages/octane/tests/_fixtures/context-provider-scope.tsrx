import { createContext, memo, useContext, useState } from 'octane';

const Value = createContext(13);

function Reader({ name }: { name: string }) @{
	const value = useContext(Value);
	const [clicks, setClicks] = useState(0);
	<button data-reader={name} onClick={() => setClicks(clicks + 1)}>
		{`${Object.is(value, -0) ? '-0' : value}:${clicks}`}
	</button>
}

function Contents({ name, shadow }: { name: string; shadow: number }) @{
	<>
		<Reader name={name} />
		<Value value={shadow}>
			<Reader name={`${name}-shadow`} />
		</Value>
	</>
}
const MemoContents = memo(Contents);

export function App({
	rows,
	tick,
}: {
	rows: readonly { name: string; value: number; shadow: number }[];
	tick: number;
}) @{
	<main data-tick={tick}>
		<Reader name="default" />
		@for (const row of rows; key row.name) {
			<Value value={row.value}>
				<MemoContents name={row.name} shadow={row.shadow} />
			</Value>
		}
	</main>
}
