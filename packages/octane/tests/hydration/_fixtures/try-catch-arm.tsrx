import { ErrorBoundary, Suspense, use } from 'octane';

// Server and client render failures exercise authored and JSX error boundaries.

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

// A Suspense boundary with its own catch arm.
export function Recovering(props: StateProps) @{
	<main>
		@try {
			<section>
				<Result state={props.state} />
			</section>
		} @pending {
			<i>loading</i>
		} @catch (error, retry) {
			<button
				onClick={() => {
					props.state.failed = false;
					retry();
				}}
			>
				{(error as Error).message as string}
			</button>
		}
		<footer>after</footer>
	</main>
}

// A catch-only boundary inside a Suspense boundary.
export function CatchInsidePending(props: StateProps) @{
	<main>
		@try {
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
				>
					{(error as Error).message as string}
				</button>
			}
		} @pending {
			<i>loading</i>
		}
		<footer>after</footer>
	</main>
}

export function JsxBoundaries(props: StateProps) @{
	<main>
		<Suspense fallback={<i>loading</i>}>
			<ErrorBoundary
				fallback={(error: unknown, retry: () => void) => (
					<button
						onClick={() => {
							props.state.failed = false;
							retry();
						}}
					>
						{(error as Error).message as string}
					</button>
				)}
			>
				<section>
					<Result state={props.state} />
				</section>
			</ErrorBoundary>
		</Suspense>
		<footer>after</footer>
	</main>
}

// No Suspense boundary surrounds these catch arms.
export function CatchOnly(props: StateProps) @{
	<main>
		@try {
			<Result state={props.state} />
		} @catch (error) {
			<button>{(error as Error).message as string}</button>
		}
	</main>
}

export function JsxCatchOnly(props: StateProps) @{
	<main>
		<ErrorBoundary fallback={(error: unknown) => <button>{(error as Error).message}</button>}>
			<Result state={props.state} />
		</ErrorBoundary>
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
		>
			{(error as Error).message as string}
		</button>
	}
}

interface PromiseProps {
	promise: Promise<string>;
}

// Throws when its value is 'bad', after the stream sent the boundary's fallback.
function Checked(props: PromiseProps) @{
	const value = use(props.promise);
	if (value === 'bad') throw new Error('bad value');
	<p>{value as string}</p>
}

export function Streamed(props: PromiseProps) @{
	<main>
		@try {
			<section>
				<Checked promise={props.promise} />
			</section>
		} @pending {
			<i>loading</i>
		} @catch (error) {
			<button>{(error as Error).message as string}</button>
		}
		<footer>after</footer>
	</main>
}

function After() @{
	<p class="after">after</p>
}

// A boundary with a root-level sibling after it.
export function RootSiblingStatic(props: StateProps) @{
	<>
		@try {
			<Result state={props.state} />
		} @catch (error) {
			<button>{(error as Error).message as string}</button>
		}
		<p class="after">after</p>
	</>
}

export function RootSiblingComponent(props: StateProps) @{
	<>
		@try {
			<Result state={props.state} />
		} @catch (error) {
			<button>{(error as Error).message as string}</button>
		}
		<After />
	</>
}

export function HostSibling(props: StateProps) @{
	<main>
		@try {
			<Result state={props.state} />
		} @catch (error) {
			<button>{(error as Error).message as string}</button>
		}
		<After />
	</main>
}
