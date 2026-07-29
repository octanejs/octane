/** @jsxImportSource octane */

import { useContext, useEffect, useState } from 'octane';
import { AutoMemoChild, AutoMemoContext } from './auto-memo-child.tsrx';

type Row = { id: number; label: string };
type MappableRows = {
	map: <T>(callback: (item: Row, index: number) => T, thisArg?: unknown) => T[];
};

export function TsxCustomMapApp(props: {
	rows: MappableRows;
	prefix: string;
	onItem: (id: number, index: number) => string;
}) {
	const rows = props.rows;

	return (
		<ul id="tsx-custom-map-rows">
			{rows.map((item, index) => (
				<li key={item.id} data-callback={props.onItem(item.id, index)}>
					{`${props.prefix}:${index}:${item.label}`}
				</li>
			))}
		</ul>
	);
}

export function TsxBoundMapApp(props: {
	rows: MappableRows;
	receiver: { prefix: string };
	onItem: (id: number, index: number) => string;
}) {
	return (
		<ul id="tsx-bound-map-rows">
			{props.rows.map(function (this: { prefix: string }, item, index) {
				return (
					<li key={item.id} data-callback={props.onItem(item.id, index)}>
						{`${this.prefix}:${index}:${item.label}`}
					</li>
				);
			}, props.receiver)}
		</ul>
	);
}

export function TsxGetterMapApp(props: {
	source: { readonly rows: MappableRows };
	prefix: string;
	onItem: (id: number, index: number) => string;
}) {
	return (
		<ul id="tsx-getter-map-rows">
			{props.source.rows.map((item, index) => (
				<li key={item.id} data-callback={props.onItem(item.id, index)}>
					{`${props.prefix}:${index}:${item.label}`}
				</li>
			))}
		</ul>
	);
}

export function TsxMapExtraArgumentApp(props: {
	rows: Row[];
	prefix: string;
	makeThisArg: () => unknown;
	onItem: (id: number, index: number) => string;
}) {
	const rows = props.rows;

	return (
		<ul id="tsx-extra-map-rows">
			{rows.map(
				(item, index) => (
					<li key={item.id} data-callback={props.onItem(item.id, index)}>
						{`${props.prefix}:${index}:${item.label}`}
					</li>
				),
				props.makeThisArg(),
			)}
		</ul>
	);
}

export function TsxStatefulMappedApp(props: { rows: MappableRows; prefix: string; theme: string }) {
	return (
		<AutoMemoContext.Provider value={props.theme}>
			<ul id="tsx-stateful-mapped-rows">
				{props.rows.map((item, index) => (
					<AutoMemoChild
						key={item.id}
						id={item.id}
						label={`${props.prefix}:${index}:${item.label}`}
					/>
				))}
			</ul>
		</AutoMemoContext.Provider>
	);
}

type MappedComponentProps = {
	rows: MappableRows;
	prefix: string;
	theme: string;
	onEffect: (event: string) => void;
	onItem: (id: number, index: number) => string;
};

function TsxTrackedMappedRow(props: {
	id: number;
	label: string;
	onEffect: (event: string) => void;
}) {
	const theme = useContext(AutoMemoContext);
	const [own, setOwn] = useState(0);

	useEffect(() => {
		props.onEffect(`mount:${props.id}`);
		return () => props.onEffect(`cleanup:${props.id}`);
	}, [props.id, props.onEffect]);

	return (
		<li data-id={props.id}>
			<button className={`tracked-own-${props.id}`} onClick={() => setOwn(own + 1)}>
				{`${theme}:${props.label}:${own}`}
			</button>
		</li>
	);
}

function TsxMappedComponentRows(props: MappedComponentProps) {
	const rows = props.rows;

	return (
		<ul id="tsx-mapped-component-rows">
			{rows.map((item, index) => (
				<TsxTrackedMappedRow
					key={item.id}
					id={item.id}
					label={`${props.prefix}:${props.onItem(item.id, index)}:${item.label}`}
					onEffect={props.onEffect}
				/>
			))}
		</ul>
	);
}

export function TsxMappedComponentApp(props: MappedComponentProps) {
	return (
		<AutoMemoContext.Provider value={props.theme}>
			<TsxMappedComponentRows {...props} />
		</AutoMemoContext.Provider>
	);
}

function TsxRows(props: { items: Row[]; prefix: string }) {
	const items = props.items;
	const prefix = props.prefix;

	return (
		<ul id="tsx-auto-rows">
			{items.map((item, index) => (
				<AutoMemoChild key={item.id} id={item.id} label={`${prefix}:${index}:${item.label}`} />
			))}
		</ul>
	);
}

export function TsxAutoMemoApp() {
	const [items, setItems] = useState<Row[]>([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
	]);
	const [theme, setTheme] = useState('t0');
	const [prefix, setPrefix] = useState('p0');
	const [version, setVersion] = useState(0);

	return (
		<section>
			<button id="tsx-auto-tick" onClick={() => setVersion((value) => value + 1)}>
				{version}
			</button>
			<button id="tsx-auto-theme" onClick={() => setTheme((value) => value + '!')}>
				context
			</button>
			<button id="tsx-auto-prefix" onClick={() => setPrefix((value) => value + '!')}>
				prefix
			</button>
			<button
				id="tsx-auto-item"
				onClick={() =>
					setItems((current) =>
						current.map((item) => (item.id === 1 ? { ...item, label: item.label + '!' } : item)),
					)
				}
			>
				item
			</button>
			<button
				id="tsx-auto-item-theme"
				onClick={() => {
					setItems((current) =>
						current.map((item) => (item.id === 1 ? { ...item, label: item.label + '!' } : item)),
					);
					setTheme((value) => value + '!');
				}}
			>
				item and context
			</button>
			<button id="tsx-auto-reorder" onClick={() => setItems((current) => current.toReversed())}>
				reorder
			</button>
			<AutoMemoContext.Provider value={theme}>
				<TsxRows items={items} prefix={prefix} />
			</AutoMemoContext.Provider>
		</section>
	);
}

type LiveRow = { id: number; read: () => string };

export function TsxImpureRowsApp() {
	const [source] = useState({ value: 'v0' });
	const [items] = useState<LiveRow[]>([
		{ id: 1, read: () => 'first:' + source.value },
		{ id: 2, read: () => 'second:' + source.value },
	]);
	const [version, setVersion] = useState(0);

	return (
		<section>
			<button
				id="tsx-impure-advance"
				onClick={() => {
					source.value = 'v' + (version + 1);
					setVersion((value) => value + 1);
				}}
			>
				advance
			</button>
			<ul id="tsx-impure-rows">
				{items.map((item) => (
					<li key={item.id} className="tsx-impure-row">
						{item.read()}
					</li>
				))}
			</ul>
		</section>
	);
}
