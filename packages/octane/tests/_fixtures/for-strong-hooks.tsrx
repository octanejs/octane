'use strong';

import { createContext, useContext, useRef, useState } from 'octane';

const MethodContext = createContext('initial');
const contextMethod = 'readContextValue';

export function ComputedHookMethodRows({ value }: { value: string }) @{
	const [contextRows] = useState(
		() => [
			{
				id: 1,
				[contextMethod]() {
					return useContext(MethodContext);
				},
			},
		],
	);
	<MethodContext.Provider value={value}>
		<ul>
			@for (const contextRow of contextRows; key contextRow.id) {
				<li>{contextRow.readContextValue() as string}</li>
			}
		</ul>
	</MethodContext.Provider>
}

const refFormatter = {
	formatRef(value: string) {
		return value;
	},
};

export function RefArgumentMethodRows() @{
	const valueRef = useRef('first');
	const [argumentRows] = useState([{ id: 1 }]);
	const [, rerender] = useState(0);
	<div>
		<button
			id="mutate-ref"
			onClick={() => {
				valueRef.current = 'second';
				rerender((count) => count + 1);
			}}
		>change</button>
		<ul>
			@for (const argumentRow of argumentRows; key argumentRow.id) {
				<li>{refFormatter.formatRef(valueRef.current) as string}</li>
			}
		</ul>
	</div>
}

export function AliasedRefMethodRows() @{
	const aliasRef = useRef({
		label: 'first',
		readRefLabel() {
			return this.label;
		},
	});
	const aliasedReader = aliasRef.current;
	const [aliasRows] = useState([{ id: 1 }]);
	const [, rerender] = useState(0);
	<div>
		<button
			id="mutate-ref"
			onClick={() => {
				aliasRef.current.label = 'second';
				rerender((count) => count + 1);
			}}
		>change</button>
		<ul>
			@for (const aliasRow of aliasRows; key aliasRow.id) {
				<li>{aliasedReader.readRefLabel() as string}</li>
			}
		</ul>
	</div>
}

export function DestructuredRefMethodRows() @{
	const destructuredRef = useRef({
		label: 'first',
		readDestructuredLabel() {
			return this.label;
		},
	});
	const { current: destructuredReader } = destructuredRef;
	const [destructuredRows] = useState([{ id: 1 }]);
	const [, rerender] = useState(0);
	<div>
		<button
			id="mutate-ref"
			onClick={() => {
				destructuredRef.current.label = 'second';
				rerender((count) => count + 1);
			}}
		>change</button>
		<ul>
			@for (const destructuredRow of destructuredRows; key destructuredRow.id) {
				<li>{destructuredReader.readDestructuredLabel() as string}</li>
			}
		</ul>
	</div>
}
