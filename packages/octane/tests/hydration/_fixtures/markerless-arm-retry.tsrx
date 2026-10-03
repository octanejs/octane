import { Hydrate, use } from 'octane';
import { load } from 'octane/hydration';

// The server renders each component's @if first arm. The client renders the
// @else arm, whose @switch has no server range: its arm takes the place of
// the server node at the cursor, adopts what it can, and then suspends on a
// value the server rendered no seed for. The deferred boundary retries that
// same arm once the value resolves, or another case replaces it.

function Em() @{
	<em>{'e'}</em>
}

function Txt() @{
	<i>{'z'}</i>
}

function Reader(props: { value: Promise<string> }) @{
	<i>{use(props.value) as string}</i>
}

// The arm adopts the server `<u>`, then suspends on its text.
export function SingleRoot(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<u>{'z'}</u>
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<u>{use(props.leaf) as string}</u>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The same arm under an @if with no server range.
export function IfArm(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<u>{'z'}</u>
						<Em />
					</>
				} @else {
					<>
						@if (props.k === 'a') {
							<u>{use(props.leaf) as string}</u>
						} @else if (props.k === 'c') {
							<b>{'c'}</b>
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The arm suspends before it clones anything.
export function BeforeClone(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<u>{'z'}</u>
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								const text = use(props.leaf);
								<u>{text as string}</u>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The node at the cursor is server text.
export function TextArm(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						{'z' as string}
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<>
									{use(props.leaf) as string}
								</>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The arm has two roots, and the component that renders its second root
// suspends inside the server range it adopted.
export function MultiRoot(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<s>{'s'}</s>
						<Txt />
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<>
									<s>{'s'}</s>
									<Reader value={props.leaf} />
								</>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// An earlier sibling parks the cursor on the switch's start each time it
// renders, so only the arm's own renders say where its content ends.
export function LeadSibling(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<Em />
						<s>{'s'}</s>
						<Txt />
						<Em />
					</>
				} @else {
					<>
						<Em />
						@switch (props.k) {
							@case 'a': {
								<>
									<s>{'s'}</s>
									<Reader value={props.leaf} />
								</>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The component that suspends renders inside the arm's second root.
export function NestedRoot(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<s>{'s'}</s>
						<p>
							<Txt />
						</p>
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<>
									<s>{'s'}</s>
									<p>
										<Reader value={props.leaf} />
									</p>
								</>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The arm's second component first renders when the boundary retries.
export function LaterSlot(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<s>{'s'}</s>
						<Txt />
						<Txt />
						<Em />
					</>
				} @else {
					<>
						@switch (props.k) {
							@case 'a': {
								<>
									<s>{'s'}</s>
									<Reader value={props.leaf} />
									<Txt />
								</>
							}
							@case 'c': {
								<b>{'c'}</b>
							}
						}
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// No suspension: the arm's render leaves the cursor at the end of its root.
export function NestedTail(props: { server?: boolean; k: string }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<p>
						<Txt />
					</p>
					<Em />
				</>
			} @else {
				<>
					@switch (props.k) {
						@case 'a': {
							<p>
								<Txt />
							</p>
						}
						@case 'c': {
							<b>{'c'}</b>
						}
					}
					<Em />
				</>
			}
		</section>
	</div>
}

// No suspension: the arm's two roots run up to the end of the @else arm.
export function LastArm(props: { server?: boolean; k: string }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<s>{'s'}</s>
					<Txt />
				</>
			} @else {
				@switch (props.k) {
					@case 'a': {
						<>
							<s>{'s'}</s>
							<Txt />
						</>
					}
					@case 'c': {
						<b>{'c'}</b>
					}
				}
			}
		</section>
	</div>
}

// The arm's last root is static, after the component that suspends. The
// arm is the whole content of the @else arm, so the server's @if range
// ends after it.
export function TrailingRoot(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<s>{'s'}</s>
						<i>{'z'}</i>
						<b>{'b'}</b>
					</>
				} @else {
					@if (props.k === 'a') {
						<>
							<s>{'s'}</s>
							<Reader value={props.leaf} />
							<b>{'b'}</b>
						</>
					} @else if (props.k === 'c') {
						<p>{'c'}</p>
					}
				}
				<em>{'e'}</em>
			</section>
		</Hydrate>
	</div>
}

// The arm suspends before its template adopts anything, so only the retry
// says where its roots end.
export function TrailingClone(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<s>{'s'}</s>
						<i>{'z'}</i>
						<b>{'b'}</b>
					</>
				} @else {
					@if (props.k === 'a') {
						const text = use(props.leaf);
						<>
							<s>{'s'}</s>
							<i>{text as string}</i>
							<b>{'b'}</b>
						</>
					} @else if (props.k === 'c') {
						<p>{'c'}</p>
					}
				}
				<em>{'e'}</em>
			</section>
		</Hydrate>
	</div>
}

function ServerFrame() @{
	<>
		<s>{'s'}</s>
		<i>{'z'}</i>
		<b>{'b'}</b>
	</>
}

function ClientFrame(props: { k: string; leaf: Promise<string> }) @{
	@if (props.k === 'a') {
		<>
			<s>{'s'}</s>
			<Reader value={props.leaf} />
			<b>{'b'}</b>
		</>
	} @else if (props.k === 'c') {
		<p>{'c'}</p>
	}
}

// The same arm as the body of a component whose identity differs on the
// client: the arm's template adopts the server component's roots in place.
export function TrailingFrame(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	const Shape = props.server ? ServerFrame : ClientFrame;
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				<Shape k={props.k} leaf={props.leaf} />
				<em>{'e'}</em>
			</section>
		</Hydrate>
	</div>
}
