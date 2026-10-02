import { Hydrate, use } from 'octane';
import { load } from 'octane/hydration';

function Em() @{
	<em>{'e'}</em>
}

function Para() @{
	<p>{'p'}</p>
}

function Reader(props: { value: Promise<string> }) @{
	<u>{use(props.value) as string}</u>
}

// Each Branch renders `<b>` on the server where the client renders a `<u>`
// that suspends after its clone mismatched. The server `<em>` after the `<b>`
// is the client's own Em, which adopts it once the `<u>` resolves.

// A deferred boundary retries the same blocks rather than starting a new
// attempt, so the retry's clone starts where the suspended attempt stopped.
export function DeferredSwitchBranch(props: {
	server?: boolean;
	k: string;
	leaf: Promise<string>;
}) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<b class="server">{'server'}</b>
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<u>{use(props.leaf) as string}</u>
							}
							@case 'c': {
								<i>{'c'}</i>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The same arm under a Suspense boundary the server resolved, whose suspended
// attempt is discarded.
export function TrySwitchBranch(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		@try {
			<section>
				@if (props.server) {
					<>
						<b class="server">{'server'}</b>
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<u>{use(props.leaf) as string}</u>
							}
							@case 'c': {
								<i>{'c'}</i>
							}
						}
						<Em />
					</>
				}
			</section>
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// With no boundary, the root's hydrating attempt suspends and rolls back.
export function RootSwitchBranch(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<section>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<Em />
			</>
		} @else {
			<>
				@switch (props.k) {
					@case 'a': {
						<u>{use(props.leaf) as string}</u>
					}
					@case 'c': {
						<i>{'c'}</i>
					}
				}
				<Em />
			</>
		}
	</section>
}

// The `<u>` is a component's root rather than a @switch arm's.
export function DeferredComponentBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<b class="server">{'server'}</b>
						<Em />
					</>
				} @else {
					<>
						<Reader value={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The server rendered another component's range where the client's `<u>` goes.
export function DeferredRangeBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<Para />
						<Em />
					</>
				} @else {
					<>
						<Reader value={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The client's Hydrate wrapper is rebuilt over the server `<p>`.
export function HydrateWrapperBranch(props: { server?: boolean }) @{
	<section>
		@if (props.server) {
			<>
				<Para />
				<Em />
			</>
		} @else {
			<>
				<Hydrate split={false} when={load()}>
					<i>{'ok'}</i>
				</Hydrate>
				<Em />
			</>
		}
	</section>
}
