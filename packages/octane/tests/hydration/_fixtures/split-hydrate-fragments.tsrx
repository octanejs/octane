import {
	act,
	createContext,
	createRoot,
	flushSync,
	hydrateRoot,
	Hydrate,
	useContext,
	useLayoutEffect,
	useState,
	type HydrateProps,
	type OctaneNode,
} from 'octane';

export type Props = {
	when: HydrateProps['when'];
	show: boolean;
	label: string;
	tone: string;
	opacity: number;
	rows: string[];
	general?: boolean;
	onEffect?: (phase: 'mount' | 'cleanup', row: string) => void;
	onRef?: (node: HTMLElement | null) => void;
	onClick?: (label: string) => void;
};

const RegionContext = createContext('outside');

function Region(props: { value: string; children?: OctaneNode }) @{
	<RegionContext value={props.value}>{props.children}</RegionContext>
}

function Heading(props: { label: string; position: string }) @{
	<h2 data-heading={props.position}>{props.label as string}</h2>
}

function StatefulHeading(props: { label: string; position: string }) @{
	const [count, setCount] = useState(0);
	<h2 data-heading={props.position} onClick={() => setCount(count + 1)}>
		{props.label + ':' + count}
	</h2>
}

function LiteRow(props: Props & { row: string }) @{
	const region = useContext(RegionContext);
	<div data-row={props.row}>
		<span data-row-prefix={props.row}>Leading sibling</span>
		@if (props.show) {
			useLayoutEffect(() => {
				props.onEffect?.('mount', props.row);
				return () => props.onEffect?.('cleanup', props.row);
			}, []);
			<>
				<Heading label={props.label} position="first" />
				<Heading label={props.label} position="second" />
				<section
					data-fragment-section={props.row}
					data-region={region}
					class={props.tone}
					style={{ opacity: props.opacity }}
					ref={props.onRef}
				>
					<button onClick={() => props.onClick?.(props.label)}>{props.label as string}</button>
				</section>
			</>
		}
		<input data-row-tail={props.row} defaultValue="server row draft" />
	</div>
}

function GeneralRow(props: Props & { row: string }) @{
	const region = useContext(RegionContext);
	<div data-row={props.row}>
		<span data-row-prefix={props.row}>Leading sibling</span>
		@if (props.show) {
			useLayoutEffect(() => {
				props.onEffect?.('mount', props.row);
				return () => props.onEffect?.('cleanup', props.row);
			}, []);
			<>
				<StatefulHeading label={props.label} position="first" />
				<StatefulHeading label={props.label} position="second" />
				<section
					data-fragment-section={props.row}
					data-region={region}
					class={props.tone}
					style={{ opacity: props.opacity }}
					ref={props.onRef}
				>
					<button onClick={() => props.onClick?.(props.label)}>{props.label as string}</button>
				</section>
			</>
		}
		<input data-row-tail={props.row} defaultValue="server row draft" />
	</div>
}

export function LiteBoundary(props: Props) @{
	<Region value="fragment region">
		<main>
			<Hydrate when={props.when}>
				@for (const row of props.rows; key row) {
					<LiteRow
						row={row}
						when={props.when}
						show={props.show}
						label={props.label}
						tone={props.tone}
						opacity={props.opacity}
						rows={props.rows}
						onEffect={props.onEffect}
						onRef={props.onRef}
						onClick={props.onClick}
					/>
				}
			</Hydrate>
			<input id="fragment-outside" defaultValue="server outside draft" />
		</main>
	</Region>
}

export function GeneralBoundary(props: Props) @{
	<Region value="fragment region">
		<main>
			<Hydrate when={props.when}>
				@for (const row of props.rows; key row) {
					<GeneralRow
						row={row}
						when={props.when}
						show={props.show}
						label={props.label}
						tone={props.tone}
						opacity={props.opacity}
						rows={props.rows}
						onEffect={props.onEffect}
						onRef={props.onRef}
						onClick={props.onClick}
					/>
				}
			</Hydrate>
			<input id="fragment-outside" defaultValue="server outside draft" />
		</main>
	</Region>
}

export function RootBoundary(props: Props) @{
	<Region value="fragment region">
		<main>
			<Hydrate when={props.when}>
				@if (props.show) {
					<>
						<Heading label={props.label} position="first" />
						<Heading label={props.label} position="second" />
						<section
							class={props.tone}
							style={{ opacity: props.opacity }}
						>{props.label as string}</section>
					</>
				}
				<input id="fragment-root-tail" defaultValue="server root draft" />
			</Hydrate>
			<input id="fragment-outside" defaultValue="server outside draft" />
		</main>
	</Region>
}

export function SoleRootBoundary(props: Props) @{
	<main>
		<Hydrate when={props.when}>
			@if (props.show) {
				<>
					<Heading label={props.label} position="first" />
					<Heading label={props.label} position="second" />
					<section
						class={props.tone}
						style={{ opacity: props.opacity }}
					>{props.label as string}</section>
				</>
			}
		</Hydrate>
		<input id="fragment-outside" defaultValue="server outside draft" />
	</main>
}

export function DirectBoundary(props: Props) @{
	<Region value="fragment region">
		<main>
			<LiteRow {...props} row="first-row" />
			<input id="fragment-outside" defaultValue="server outside draft" />
		</main>
	</Region>
}

export function ReplacementBoundary(props: Props) @{
	const View = props.general ? GeneralRow : LiteRow;
	<Region value={props.label}>
		<main>
			<Hydrate when={props.when}>
				@if (props.show) {
					<View {...props} row="replacement-row" />
				} @else {
					<div data-server-host>{props.label as string}</div>
				}
			</Hydrate>
			<input id="fragment-outside" defaultValue="server outside draft" />
		</main>
	</Region>
}

export function start(
	host: HTMLElement,
	props: Props,
	mode: 'row' | 'root' | 'sole' | 'direct' | 'replacement' = 'row',
	hydrate = true,
) {
	const View =
		mode === 'root'
			? RootBoundary
			: mode === 'sole'
				? SoleRootBoundary
				: mode === 'direct'
					? DirectBoundary
					: mode === 'replacement'
						? ReplacementBoundary
						: props.general
							? GeneralBoundary
							: LiteBoundary;
	const recoverable: unknown[] = [];
	const root =
		hydrate
			? hydrateRoot(host, View, props, {
					onRecoverableError: (error) => recoverable.push(error),
				})
			: createRoot(host);
	if (!hydrate) root.render(View, props);
	return {
		recoverable,
		settle: () => act(() => {}),
		update: (next: Props) => act(() => root.render(View, next)),
		unmount: () => flushSync(() => root.unmount()),
	};
}
