import { Hydrate, use, useRef } from 'octane';
import { load, never } from 'octane/hydration';

function Em() @{
	<em>{'e'}</em>
}

function Bold() @{
	<b class="server">{'server'}</b>
}

function Frag(props: { leaf: Promise<string> }) @{
	<>
		<u>{use(props.leaf) as string}</u>
		<i>{'x'}</i>
	</>
}

function Pair() @{
	<>
		<u>{'u'}</u>
		<i>{'x'}</i>
	</>
}

// The server rendered an element where the client's first call renders a
// component range, and the component suspends.
export function FragBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<Frag leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The same shape with a nested boundary that renders without suspending.
export function HydrateBranch(props: { server?: boolean }) @{
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
						<Hydrate split={false} when={load()}>
							<i>{'ok'}</i>
						</Hydrate>
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The same shape with a fragment component that renders without suspending.
export function PairBranch(props: { server?: boolean }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					<Em />
				</>
			} @else {
				<>
					<Pair />
					<Em />
				</>
			}
		</section>
	</div>
}

// The server rendered another component's range where the client's suspending
// fragment component claims it.
export function RangeBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<Bold />
						<Em />
					</>
				} @else {
					<>
						<Frag leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The first shape without a boundary: the root's hydrating attempt suspends.
export function FragRoot(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					<Em />
				</>
			} @else {
				<>
					<Frag leaf={props.leaf} />
					<Em />
				</>
			}
		</section>
	</div>
}

// The server's arm ends with a component range the client's arm lacks.
export function TailBranch(props: { server?: boolean }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					<Em />
				</>
			} @else {
				<Pair />
			}
		</section>
	</div>
}

function Under(props: { leaf: Promise<string> }) @{
	<u>{use(props.leaf) as string}</u>
}

// A hook keeps this a full component call in both compiles; the development
// compile renders a hookless call through the lite slot instead.
function FragChild(props: { leaf: Promise<string> }) @{
	const mark = useRef<HTMLElement | null>(null);
	<>
		<Under leaf={props.leaf} />
		<i ref={mark}>{'x'}</i>
	</>
}

// The suspending read sits in a child of the component.
export function FragChildBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<FragChild leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

function Thrower(): never {
	throw new Error('boom');
}

// The sibling after the server's element is a boundary whose server render
// threw, so the server marked its range as the caught arm.
export function CaughtBranch(props: { server?: boolean }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					@try {
						<Thrower />
					} @catch (error) {
						<s>{(error as Error).message as string}</s>
					}
				</>
			} @else {
				<>
					<Pair />
					@try {
						<Thrower />
					} @catch (error) {
						<s>{(error as Error).message as string}</s>
					}
				</>
			}
		</section>
	</div>
}

// The sibling after the server's element is a boundary that never hydrates.
export function StaticBranch(props: { server?: boolean }) @{
	<div>
		<section>
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					<Hydrate split={false} when={never()}>
						<s>{'static'}</s>
					</Hydrate>
				</>
			} @else {
				<>
					<Pair />
					<Hydrate split={false} when={never()}>
						<s>{'static'}</s>
					</Hydrate>
				</>
			}
		</section>
	</div>
}
