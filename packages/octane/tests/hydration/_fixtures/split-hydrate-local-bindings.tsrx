import { Hydrate, type HydrateProps } from 'octane';

// Each split boundary reads a name that a directive binds locally: a `@catch`
// reset parameter or destructured error, an `@for` index, an `@switch` arm
// local, or a `case` local in a handler. The parent must not pass those names
// into the split child, and a same-named module declaration must not replace
// them inside the child.

function reset(): void {
	throw new Error('module reset');
}
const position = 'module position';
const heading = 'module heading';

export type Failure = { failed: boolean };

export type Props = {
	when: HydrateProps['when'];
	state: Failure;
	inner: Failure;
	rows: string[];
	kind: 'a' | 'b';
	label: string;
	onPick: (value: string) => void;
};

function Result(props: { state: Failure; label: string }) @{
	if (props.state.failed) throw new Error(props.label + ' failed');
	<p class="result">{props.label + ' ready'}</p>
}

export function CatchReset(props: Props) @{
	<Hydrate when={props.when}>
		@try {
			<Result state={props.state} label="catch" />
		} @catch (error: unknown, retry) {
			<button
				class="retry"
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>
				{(error as Error).message as string}
			</button>
		}
	</Hydrate>
}

export function NestedCatch(props: Props) @{
	<Hydrate when={props.when}>
		@try {
			<>
				<Result state={props.state} label="outer" />
				@try {
					<Result state={props.inner} label="inner" />
				} @catch (innerError: unknown, again) {
					<button
						class="inner-retry"
						onClick={() => {
							props.inner.failed = false;
							again();
						}}
					>
						{(innerError as Error).message as string}
					</button>
				}
			</>
		} @catch ({ message }: any, retry) {
			<button
				class="outer-retry"
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>
				{message as string}
			</button>
		}
	</Hydrate>
}

export function IndexedRows(props: Props) @{
	<Hydrate when={props.when}>
		<ul>
			@for (const row of props.rows; index i; key row + ':' + i) {
				<li>
					<button onClick={() => props.onPick(row + '@' + i)}>{row + '@' + i}</button>
				</li>
			}
		</ul>
	</Hydrate>
}

export function EmptyRows(props: Props) @{
	const label = props.label;
	<Hydrate when={props.when}>
		<ul>
			@for (const label of props.rows) {
				<li>{label as string}</li>
			} @empty {
				<li class="empty">{label as string}</li>
			}
		</ul>
	</Hydrate>
}

export function SwitchArm(props: Props) @{
	<Hydrate when={props.when}>
		@switch (props.kind) {
			@case 'a': {
				const text = props.label + ' arm';
				<p class="arm">{text}</p>
			}
			@default: {
				<p class="arm">default</p>
			}
		}
	</Hydrate>
}

export function SwitchHandler(props: Props) @{
	<Hydrate when={props.when}>
		<button
			class="pick"
			onClick={() => {
				switch (props.kind) {
					case 'a':
						const choice = props.label + ':a';
						props.onPick(choice);
						break;
					default:
						props.onPick('default');
				}
			}}
		>
			pick
		</button>
	</Hydrate>
}

export function ShadowedReset(props: Props) @{
	<main>
		@try {
			<Result state={props.state} label="shadowed" />
		} @catch (error: unknown, reset) {
			<Hydrate when={props.when}>
				<button
					class="retry"
					onClick={() => {
						props.state.failed = false;
						reset();
					}}
				>
					{(error as Error).message as string}
				</button>
			</Hydrate>
		}
	</main>
}

export function ShadowedIndex(props: Props) @{
	<ul>
		@for (const row of props.rows; index position; key row) {
			<li>
				<Hydrate when={props.when}>
					<button onClick={() => props.onPick(row + '@' + position)}>{row + '@' + position}</button>
				</Hydrate>
			</li>
		}
	</ul>
}

export function ShadowedArm(props: Props) @{
	@switch (props.kind) {
		@case 'a': {
			const heading = props.label + ' heading';
			<Hydrate when={props.when}>
				<h2>{heading}</h2>
			</Hydrate>
		}
		@default: {
			<p>default</p>
		}
	}
}
