import { Hydrate, use, useState } from 'octane';
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

function BoldThenItalic() @{
	<>
		<b class="server">{'server'}</b>
		<i>{'x'}</i>
	</>
}

// A rebuilt single root in a fragment's leading hole. The fragment adopts the
// static root after it, so the rebuilt root is not its range's whole content.
function ParaThenItalic(props: { leaf: Promise<string> }) @{
	<>
		<Para leaf={props.leaf} />
		<i>{'x'}</i>
	</>
}

export function RebuiltHoleBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<BoldThenItalic />
						<Em />
					</>
				} @else {
					<>
						<ParaThenItalic leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The same fragment in a component with hooks, which renders in a full slot.
function StateParaThenItalic(props: { leaf: Promise<string> }) @{
	const [label] = useState('x');
	<>
		<Para leaf={props.leaf} />
		<i>{label as string}</i>
	</>
}

export function StateRebuiltHoleBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@if (props.server) {
					<>
						<BoldThenItalic />
						<Em />
					</>
				} @else {
					<>
						<StateParaThenItalic leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// A wrapper whose only call inherits its range renders the rebuilt root.
function ParaCall(props: { leaf: Promise<string> }) @{
	<Para leaf={props.leaf} />
}

export function InheritedRootBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<ParaCall leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// The same rebuilt root in a component with hooks.
function StatePara(props: { leaf: Promise<string> }) @{
	const [tag] = useState('p');
	<p data-tag={tag}>
		<EmPair leaf={props.leaf} />
	</p>
}

// The rebuilt root is the value of a renderable hole.
export function RebuiltHoleValueBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				{props.server ? <BoldThenEm /> : <StatePara leaf={props.leaf} />}
				<Em />
			</section>
		</Hydrate>
	</div>
}

// The rebuilt root is what a component returns into the range it adopted.
function ReturningPara(props: { server?: boolean; leaf: Promise<string> }) {
	if (props.server)
		return (
			<>
				<b class="server">{'server'}</b>
				<em>{'tail'}</em>
			</>
		);
	return (
		<p>
			<EmPair leaf={props.leaf} />
		</p>
	);
}

export function ReturnBranch(props: { server?: boolean; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				<ReturningPara server={props.server} leaf={props.leaf} />
				<Em />
			</section>
		</Hydrate>
	</div>
}

// Suspends before its template rebuilds its single root.
function SetupPara(props: { leaf: Promise<string> }) @{
	const value = use(props.leaf);
	<p>{value as string}</p>
}

export function SetupRootBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<SetupPara leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

// Suspends after its template rebuilt its single root, before the root commits.
function InlinePara(props: { leaf: Promise<string> }) @{
	<p>{use(props.leaf) as string}</p>
}

export function InlineRootBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<InlinePara leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

function StateInlinePara(props: { leaf: Promise<string> }) @{
	const [tag] = useState('p');
	<p data-tag={tag}>{use(props.leaf) as string}</p>
}

export function StateInlineRootBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<StateInlinePara leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}

function UnderValue(props: { v: string }) @{
	<u>{props.v as string}</u>
}

// Suspends before its template claims the range it adopted.
function SetupFirst(props: { leaf: Promise<string> }) @{
	const v = use(props.leaf);
	<>
		<UnderValue v={v} />
		{'x'}
	</>
}

export function SetupFirstBranch(props: { server?: boolean; leaf: Promise<string> }) @{
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
						<SetupFirst leaf={props.leaf} />
						<Em />
					</>
				}
			</section>
		</Hydrate>
	</div>
}
