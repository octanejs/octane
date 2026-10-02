import { Hydrate, use } from 'octane';
import { load } from 'octane/hydration';

function Em() @{
	<em>{'e'}</em>
}

function Bold() @{
	<b class="server">{'server'}</b>
}

function Under(props: { leaf: Promise<string> }) @{
	<u>{use(props.leaf) as string}</u>
}

function UnderPair(props: { leaf: Promise<string> }) @{
	<>
		<u>{use(props.leaf) as string}</u>
		<s>{'s'}</s>
	</>
}

// The suspending child comes first. The static root after it shows that the
// server rendered another component there.
function HoleFirst(props: { leaf: Promise<string> }) @{
	<>
		<Under leaf={props.leaf} />
		<i>{'x'}</i>
	</>
}

function StaticFirst(props: { leaf: Promise<string> }) @{
	<>
		<i>{'x'}</i>
		<Under leaf={props.leaf} />
	</>
}

// The suspending child renders its own range.
function FramedFirst(props: { leaf: Promise<string> }) @{
	<>
		<UnderPair leaf={props.leaf} />
		<i>{'x'}</i>
	</>
}

// No static element root shows that the server rendered another component
// there, only the range's size does.
function HoleThenText(props: { leaf: Promise<string> }) @{
	<>
		<Under leaf={props.leaf} />
		{'x'}
	</>
}

// Each client arm's first component adopts the range the server rendered for
// Bold when `server` is set, and the suspending child sits inside it. Em
// follows in its own range.
export function HoleFirstBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<HoleFirst leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

export function StaticFirstBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<StaticFirst leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

export function FramedFirstBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<FramedFirst leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

export function HoleThenTextBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<HoleThenText leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

function BoldThenEm() @{
	<>
		<b class="server">{'server'}</b>
		<em>{'tail'}</em>
	</>
}

function EmPair(props: { leaf: Promise<string> }) @{
	<>
		<em>{use(props.leaf) as string}</em>
		<s>{'s'}</s>
	</>
}

// A rebuilt single root. Its suspending child starts with the tag of the server
// node that follows the one the root replaced.
function Para(props: { leaf: Promise<string> }) @{
	<p>
		<EmPair leaf={props.leaf} />
	</p>
}

export function RebuiltRootBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<BoldThenEm />
						<Em />
					</>
				} @else {
					<>
						<Para leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}
