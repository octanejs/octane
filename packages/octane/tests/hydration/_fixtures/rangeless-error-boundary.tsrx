import { ErrorBoundary, use } from 'octane';

// An error boundary that the client renders where the server rendered other
// content, here another @if arm, so the boundary has no server range. Its try
// body throws on the client.

interface Props {
	side: string;
	promise?: Promise<string>;
}

function Boom(): never {
	throw new Error('boom');
}

function Read(props: { promise: Promise<string> }) @{
	<b>{use(props.promise) as string}</b>
}

// A catch-only @try.
export function CatchOnly(props: Props) @{
	<div>
		<section>
			@if (props.side === 'server') {
				<>
					<p>{'p'}</p>
					<em>{'inner'}</em>
				</>
			} @else {
				<>
					@try {
						<Boom />
					} @catch (error: unknown) {
						<em>{'inner'}</em>
					}
				</>
			}
		</section>
	</div>
}

// An imported ErrorBoundary with a static fallback, lowered like a catch-only @try.
export function JsxBoundary(props: Props) @{
	<div>
		<section>
			@if (props.side === 'server') {
				<>
					<p>{'p'}</p>
					<em>{'inner'}</em>
				</>
			} @else {
				<>
					<ErrorBoundary fallback={(error: unknown) => <em>{'inner'}</em>}>
						<Boom />
					</ErrorBoundary>
				</>
			}
		</section>
	</div>
}

// The try body reads a promise that rejects on the client.
export function Rejected(props: Props) @{
	<div>
		<section>
			@if (props.side === 'server') {
				<>
					<p>{'p'}</p>
					<em>{'inner'}</em>
				</>
			} @else {
				<>
					@try {
						<Read promise={props.promise!} />
					} @catch (error: unknown) {
						<em>{(error as Error).message as string}</em>
					}
				</>
			}
		</section>
	</div>
}

// A @try with a @pending arm as well.
export function WithPending(props: Props) @{
	<div>
		<section>
			@if (props.side === 'server') {
				<>
					<p>{'p'}</p>
					<em>{'inner'}</em>
				</>
			} @else {
				<>
					@try {
						<Boom />
					} @pending {
						<i>{'pending'}</i>
					} @catch (error: unknown) {
						<em>{'inner'}</em>
					}
				</>
			}
		</section>
	</div>
}

// The rangeless catch-only @try sits inside a boundary the server rendered.
export function InSuspense(props: Props) @{
	<div>
		<h1>{'title'}</h1>
		@try {
			<section>
				@if (props.side === 'server') {
					<>
						<p>{'p'}</p>
						<em>{'inner'}</em>
					</>
				} @else {
					<>
						@try {
							<Boom />
						} @catch (error: unknown) {
							<em>{'inner'}</em>
						}
					</>
				}
			</section>
		} @pending {
			<i>{'pending'}</i>
		}
	</div>
}

// The try body renders what the server rendered at the boundary's position,
// but the server rendered no boundary there.
export function MatchingCatch(props: Props) @{
	<div>
		<section>
			@if (props.side === 'server') {
				<em>{'inner'}</em>
			} @else {
				<>
					@try {
						<em>{'inner'}</em>
					} @catch (error: unknown) {
						<s>{'caught'}</s>
					}
				</>
			}
		</section>
	</div>
}

export function MatchingPending(props: Props) @{
	<div>
		<section>
			@if (props.side === 'server') {
				<em>{'inner'}</em>
			} @else {
				<>
					@try {
						<em>{'inner'}</em>
					} @pending {
						<i>{'pending'}</i>
					}
				</>
			}
		</section>
	</div>
}

// The server rendered the same arm, so the boundary adopts its range.
export function SameArm(props: Props) @{
	<div>
		<section>
			@if (props.side === 'never') {
				<p>{'p'}</p>
			} @else {
				<>
					@try {
						<em>{'inner'}</em>
					} @catch (error: unknown) {
						<s>{'caught'}</s>
					}
				</>
			}
		</section>
	</div>
}
