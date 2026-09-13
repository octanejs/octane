import { useState } from 'octane';

export interface InputRow {
	id: string;
	label: string;
}

export interface InputRowsProps {
	items: InputRow[];
	prefix: string;
	read: () => string;
	onPick: (value: string) => void;
}

export function InputRows({ items, prefix, read, onPick }: InputRowsProps) @{
	<section>
		@for (const item of items; key item.id) {
			const [count, setCount] = useState(0);
			<div data-id={item.id}>
				<input defaultValue={item.label} />
				<button
					onClick={() => {
						onPick(item.label + ':' + prefix);
						setCount(count + 1);
					}}
				>
					{item.label + ':' + prefix + ':' + count}
				</button>
			</div>
		}
		<p>{read()}</p>
	</section>
}

export function InputOnlyRows({ items, read }: InputRowsProps) @{
	<section>
		@for (const item of items; key item.id) {
			const [count, setCount] = useState(0);
			<button data-id={item.id} onClick={() => setCount(count + 1)}>
				{item.label + ':' + count}
			</button>
		}
		<p>{read()}</p>
	</section>
}
