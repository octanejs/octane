import { ErrorBoundary, Hydrate, use, useState } from 'octane';
import { condition } from 'octane/hydration';

// The server's try body threw, so it rendered the @catch arm. When the client's
// try body throws again during hydration, the client must adopt that catch DOM
// rather than claim it for the try body.

interface State {
	failed: boolean;
}

interface StateProps {
	state: State;
}

function Result(props: StateProps) @{
	if (props.state.failed) throw new Error('failed');
	<p>ready</p>
}

// Hydrated without a report before, but rebuilt the catch arm.
export function Wrapped(props: StateProps) @{
	<main>
		@try {
			<Result state={props.state} />
		} @catch (error, retry) {
			<button
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>{error.message as string}</button>
		}
	</main>
}

// The boundary is the component's sole root output.
export function SoleRoot(props: StateProps) @{
	@try {
		<Result state={props.state} />
	} @catch (error, retry) {
		<button
			onClick={() => {
				props.state.failed = false;
				retry();
			}}
		>{error.message as string}</button>
	}
}

// The try body claims a host before the nested component throws.
export function HostBody(props: StateProps) @{
	<main>
		@try {
			<section>
				<Result state={props.state} />
			</section>
		} @catch (error, retry) {
			<button
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>{error.message as string}</button>
		}
	</main>
}

export function JsxBoundary(props: StateProps) @{
	<main>
		<ErrorBoundary
			fallback={(error: unknown, retry: () => void) => <button
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>{(error as Error).message as string}</button>}
		>
			<section>
				<Result state={props.state} />
			</section>
		</ErrorBoundary>
	</main>
}

interface PromiseProps {
	promise: Promise<string>;
}

// Throws when its seeded value is 'bad', or with the seeded rejection.
function Checked(props: PromiseProps) @{
	const value = use(props.promise);
	if (value === 'bad') throw new Error('bad value');
	<p>{value as string}</p>
}

function Value(props: PromiseProps) @{
	<span>{use(props.promise) as string}</span>
}

interface SeededProps {
	first: Promise<string>;
	after: Promise<string>;
}

// The try body reads a seed before throwing, and a sibling reads the next one.
export function Seeded(props: SeededProps) @{
	<main>
		@try {
			<section>
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
		<Value promise={props.after} />
	</main>
}

// A streamed boundary: the server suspended, then its try body threw.
export function Streamed(props: PromiseProps) @{
	<main>
		@try {
			<section>
				<Checked promise={props.promise} />
			</section>
		} @pending {
			<i>loading</i>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
	</main>
}

interface WaitingProps {
	state: State;
	promise: Promise<string>;
}

// Throws on the server; waits for client data where the server threw.
function Waiting(props: WaitingProps) @{
	if (props.state.failed) throw new Error('failed');
	<p>{use(props.promise) as string}</p>
}

export function WaitingPending(props: WaitingProps) @{
	<main>
		@try {
			<section>
				<Waiting state={props.state} promise={props.promise} />
			</section>
		} @pending {
			<i>loading</i>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
	</main>
}

export function WaitingOuterPending(props: WaitingProps) @{
	<main>
		@try {
			@try {
				<section>
					<Waiting state={props.state} promise={props.promise} />
				</section>
			} @catch (error) {
				<button>{error.message as string}</button>
			}
		} @pending {
			<i>loading</i>
		}
	</main>
}

export function WaitingRoot(props: WaitingProps) @{
	@try {
		<section>
			<Waiting state={props.state} promise={props.promise} />
		</section>
	} @catch (error) {
		<button>{error.message as string}</button>
	}
}

interface NestedProps {
	nested: Promise<string>;
	first: Promise<string>;
	after: Promise<string>;
}

// A nested boundary the server resolved before the try body threw: its seeds
// left the outer stream for its own sidecar, which the catch arm discarded.
export function NestedResolved(props: NestedProps) @{
	<main>
		@try {
			<section>
				@try {
					<Value promise={props.nested} />
				} @pending {
					<i>loading</i>
				}
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
		<Value promise={props.after} />
	</main>
}

interface ExpectedProps {
	promise: Promise<string>;
	value: string;
}

// Throws unless the client reads the seed the server read at this position.
function Expected(props: ExpectedProps) @{
	const value = use(props.promise);
	if (value !== props.value) throw new Error(props.value + ' read ' + value);
	<span>{value}</span>
}

interface DeepProps {
	a: Promise<string>;
	b: Promise<string>;
	c: Promise<string>;
	d: Promise<string>;
	e: Promise<string>;
	first: Promise<string>;
	after: Promise<string>;
}

// Isolated runs nest and sit beside seeds the try body kept.
export function NestedDeep(props: DeepProps) @{
	<main>
		@try {
			<section>
				@try {
					<div>
						<Expected promise={props.a} value="a" />
						@try {
							<Expected promise={props.b} value="b" />
						} @pending {
							<i>loading</i>
						}
						<Expected promise={props.c} value="c" />
					</div>
				} @pending {
					<i>loading</i>
				}
				<Expected promise={props.d} value="d" />
				@try {
					<Expected promise={props.e} value="e" />
				} @pending {
					<i>loading</i>
				}
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
		<Value promise={props.after} />
	</main>
}

interface InnerCatchProps {
	inner: Promise<string>;
	nested: Promise<string>;
	first: Promise<string>;
	after: Promise<string>;
}

function Recovered(props: PromiseProps) @{
	@try {
		<Expected promise={props.promise} value="nested" />
	} @pending {
		<i>loading</i>
	}
}

// An inner boundary's catch arm holds the resolved boundary, and the outer
// body throws after it.
export function NestedInnerCatch(props: InnerCatchProps) @{
	<main>
		@try {
			<section>
				@try {
					<Checked promise={props.inner} />
				} @catch (error) {
					<Recovered promise={props.nested} />
				}
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
		<Value promise={props.after} />
	</main>
}

interface PanelProps {
	message: string;
	promise: Promise<string>;
}

function Panel(props: PanelProps) @{
	<div>
		<button>{props.message}</button>
		@try {
			<Value promise={props.promise} />
		} @pending {
			<i>loading</i>
		}
	</div>
}

// The catch arm's own resolved boundary keeps its sidecar: the arm is adopted.
export function CatchArmNested(props: NestedProps) @{
	<main>
		@try {
			<section>
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<Panel message={error.message} promise={props.nested} />
		}
		<Value promise={props.after} />
	</main>
}

interface RetryingProps {
	nested: Promise<string>;
}

// A render-phase update replays this body, isolating the nested run twice.
function Retrying(props: RetryingProps) @{
	const [count, setCount] = useState(0);
	if (count < 1) setCount(count + 1);
	@try {
		<Expected promise={props.nested} value="nested" />
	} @pending {
		<i>loading</i>
	}
}

export function NestedRetried(props: NestedProps) @{
	<main>
		@try {
			<section>
				<Retrying nested={props.nested} />
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
		<Value promise={props.after} />
	</main>
}

interface StreamedNestedProps {
	gate: Promise<string>;
	nested: Promise<string>;
	first: Promise<string>;
}

// The outer boundary streams, and its nested boundary completes, as its own
// stream boundary, before the outer body throws.
export function StreamedNested(props: StreamedNestedProps) @{
	<main>
		@try {
			<section>
				<Expected promise={props.gate} value="gate" />
				@try {
					<Expected promise={props.nested} value="nested" />
				} @pending {
					<i>loading</i>
				}
				<Checked promise={props.first} />
			</section>
		} @pending {
			<i>outer</i>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
	</main>
}

// A Hydrate island moves its children's seeds into its own sidecar too.
export function NestedIsland(props: NestedProps) @{
	<main>
		@try {
			<section>
				<Hydrate when={condition(true)} split={false}>
					<Expected promise={props.nested} value="nested" />
				</Hydrate>
				<Checked promise={props.first} />
			</section>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
		<Value promise={props.after} />
	</main>
}

interface StreamedInnerCatchProps {
	inner: Promise<string>;
	nested: Promise<string>;
	more: Promise<string>;
	first: Promise<string>;
}

// The streamed inner boundary catches, so its segment holds both arms' seeds.
export function StreamedInnerCatch(props: StreamedInnerCatchProps) @{
	<main>
		@try {
			<section>
				@try {
					<Checked promise={props.inner} />
				} @pending {
					<i>inner</i>
				} @catch (error) {
					<div>
						<Expected promise={props.nested} value="nested" />
						<Expected promise={props.more} value="more" />
					</div>
				}
				<Checked promise={props.first} />
			</section>
		} @pending {
			<i>outer</i>
		} @catch (error) {
			<button>{error.message as string}</button>
		}
	</main>
}
