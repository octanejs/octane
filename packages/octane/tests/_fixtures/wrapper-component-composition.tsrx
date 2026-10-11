import { use, useEffect, useId, useState, type ComponentBody } from 'octane';

interface Effects {
	report: (event: 'effect' | 'cleanup', props: object) => void;
	conditional: (event: 'enabled' | 'disabled') => void;
	enabled: boolean;
	onId?: (id: string) => void;
}

export interface CounterProps extends Effects {
	label: string;
}

function Counter(props: CounterProps) @{
	const id = useId();
	const [count, setCount] = useState(0);
	props.onId?.(id);
	useEffect(() => {
		props.report('effect', props);
		return () => props.report('cleanup', props);
	}, [props]);
	if (props.enabled) {
		useEffect(() => {
			props.conditional('enabled');
			return () => props.conditional('disabled');
		}, []);
	}
	<div class="wrapped-counter">
		<output data-use-id={id}>{id as string}</output>
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
		<input defaultValue="seed" />
		<em>{props.label as string}</em>
	</div>
}

function Details(props: CounterProps) @{
	<Counter {...props} />
}
function Panel(props: CounterProps) @{
	<Details {...props} />
}
function First(props: CounterProps) @{
	<Panel {...props} />
}
function Second(props: CounterProps) @{
	<Panel {...props} />
}
function Collision(Counter: CounterProps) @{
	<Panel {...Counter} />
}

export function App(props: CounterProps) @{
	<First
		label={props.label}
		enabled={props.enabled}
		report={props.report}
		conditional={props.conditional}
		onId={props.onId}
	/>
}

export function OtherApp(props: CounterProps) @{
	<Second
		label={props.label}
		enabled={props.enabled}
		report={props.report}
		conditional={props.conditional}
		onId={props.onId}
	/>
}

export function CollisionApp(props: CounterProps) @{
	<Collision
		label={props.label}
		enabled={props.enabled}
		report={props.report}
		conditional={props.conditional}
		onId={props.onId}
	/>
}

export function ShadowedApp(Counter: CounterProps) @{
	<First
		label={Counter.label}
		enabled={Counter.enabled}
		report={Counter.report}
		conditional={Counter.conditional}
		onId={Counter.onId}
	/>
}

export function NativeHostApp(props: CounterProps) @{
	<main>
		<First
			label={props.label}
			enabled={props.enabled}
			report={props.report}
			conditional={props.conditional}
			onId={props.onId}
		/>
	</main>
}

export function Replacement(props: { label: string }) @{
	<strong>{props.label as string}</strong>
}

export function WrapperTagShadowApp(First: ComponentBody<{ label: string }>) @{
	<main>
		<First label="replacement" />
	</main>
}

export interface CounterRowsProps extends Effects {
	rows: readonly { id: number; label: string }[];
}

export function KeyedApp(props: CounterRowsProps) @{
	<main>
		@for (const row of props.rows; key row.id) {
			<article data-row={String(row.id)}>
				<First
					label={row.label}
					enabled={props.enabled}
					report={props.report}
					conditional={props.conditional}
					onId={props.onId}
				/>
			</article>
		}
	</main>
}

export function SoleKeyedApp(props: CounterRowsProps) @{
	<main>
		@for (const row of props.rows; key row.id) {
			<First
				label={row.label}
				enabled={props.enabled}
				report={props.report}
				conditional={props.conditional}
				onId={props.onId}
			/>
		}
	</main>
}

export function KeyedShadowedApp(props: CounterRowsProps) @{
	<main>
		@for (const Counter of props.rows; key Counter.id) {
			<article data-row={String(Counter.id)}>
				<First
					label={Counter.label}
					enabled={props.enabled}
					report={props.report}
					conditional={props.conditional}
					onId={props.onId}
				/>
			</article>
		}
	</main>
}

export function SiblingApp(props: Effects & { first: readonly { id: number; label: string }[] }) @{
	<main>
		<section class="first-region">
			@for (const row of props.first; key row.id) {
				<article>
					<First
						label={row.label}
						enabled={props.enabled}
						report={props.report}
						conditional={props.conditional}
						onId={props.onId}
					/>
				</article>
			}
		</section>
		<section class="second-region">
			<Second
				label="second"
				enabled={props.enabled}
				report={props.report}
				conditional={props.conditional}
				onId={props.onId}
			/>
		</section>
	</main>
}

export interface ResourceProps extends Effects {
	promise: Promise<string>;
}

function Resource(props: ResourceProps) @{
	const id = useId();
	const [count, setCount] = useState(0);
	const value = use(props.promise);
	props.onId?.(id);
	useEffect(() => {
		props.report('effect', props);
		return () => props.report('cleanup', props);
	}, [props]);
	if (props.enabled) {
		useEffect(() => {
			props.conditional('enabled');
			return () => props.conditional('disabled');
		}, []);
	}
	<div class="wrapped-resource">
		<output data-use-id={id}>{id as string}</output>
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
		<input defaultValue="seed" />
		<em>{value as string}</em>
	</div>
}

function ResourceDetails(props: ResourceProps) @{
	<Resource {...props} />
}
function ResourcePanel(props: ResourceProps) @{
	<ResourceDetails {...props} />
}
function ResourceFrame(props: ResourceProps) @{
	<ResourcePanel {...props} />
}

export function ResourceApp(props: ResourceProps) @{
	<ResourceFrame
		promise={props.promise}
		enabled={props.enabled}
		report={props.report}
		conditional={props.conditional}
		onId={props.onId}
	/>
}

export function NativeResourceHost(props: ResourceProps) @{
	<section class="resource-host">
		<strong class="before-resource">before</strong>
		<ResourceFrame
			promise={props.promise}
			enabled={props.enabled}
			report={props.report}
			conditional={props.conditional}
			onId={props.onId}
		/>
		<i class="after-resource">after</i>
	</section>
}

export function NativeResourceBoundary(props: ResourceProps) @{
	@try {
		<NativeResourceHost
			promise={props.promise}
			enabled={props.enabled}
			report={props.report}
			conditional={props.conditional}
			onId={props.onId}
		/>
	} @pending {
		<p class="native-resource-pending">waiting</p>
	}
}

export function Nested(props: ResourceProps) @{
	@try {
		<section>
			<strong>outer ready</strong>
			@try {
				<ResourceApp
					promise={props.promise}
					enabled={props.enabled}
					report={props.report}
					conditional={props.conditional}
					onId={props.onId}
				/>
			} @pending {
				<p class="inner-pending">inner waiting</p>
			}
		</section>
	} @pending {
		<p class="outer-pending">outer waiting</p>
	}
}

function LastSibling(props: { read: () => string }) @{
	const value = props.read();
	<p class="last">{value as string}</p>
}

export function Held(props: ResourceProps & { read: () => string }) @{
	<section>
		<ResourceApp
			promise={props.promise}
			enabled={props.enabled}
			report={props.report}
			conditional={props.conditional}
			onId={props.onId}
		/>
		<LastSibling read={props.read} />
	</section>
}
