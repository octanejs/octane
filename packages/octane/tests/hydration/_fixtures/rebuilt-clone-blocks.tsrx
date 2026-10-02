import { Activity, ErrorBoundary, use } from 'octane';

function label(): string {
	return 'ok';
}

function IfLeaf(props: { on: boolean }) @{
	<i>
		@if (props.on) {
			<s>{'c'}</s>
		}
		{label() as string}
	</i>
}

function SwitchLeaf(props: { k: string }) @{
	<i>
		@switch (props.k) {
			@case 'a': {
				<s>{'a'}</s>
			}
			@default: {
				<u>{'z'}</u>
			}
		}
		{label() as string}
	</i>
}

function ForLeaf(props: { items: string[] }) @{
	<i>
		@for (const x of props.items; key x) {
			<s>{x as string}</s>
		} @empty {
			<u>{'none'}</u>
		}
		{label() as string}
	</i>
}

function TryLeaf() @{
	<i>
		@try {
			<s>{'t'}</s>
		} @pending {
			<u>{'pending'}</u>
		}
		{label() as string}
	</i>
}

function ActivityLeaf() @{
	<i>
		<Activity mode="visible">
			<s>{'a'}</s>
		</Activity>
		{label() as string}
	</i>
}

function BoundaryLeaf() @{
	<i>
		<ErrorBoundary fallback={<u>{'e'}</u>}>
			<s>{'b'}</s>
		</ErrorBoundary>
		{label() as string}
	</i>
}

function Em() @{
	<em>{'e'}</em>
}

function UseLeaf(props: { value: Promise<string> }) @{
	<i>
		@if (props.value !== null) {
			<s>{use(props.value) as string}</s>
		}
		{label() as string}
	</i>
}

function UseEm(props: { value: Promise<string> }) @{
	<em>{use(props.value) as string}</em>
}

// Each Branch renders `<b>` on the server and a leaf on the client, so the
// leaf's cloned `<i>` mismatches and is rebuilt on the client.
export function IfBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<IfLeaf on={true} />
		}
	</div>
}

export function SwitchBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<SwitchLeaf k="a" />
		}
	</div>
}

export function ForBranch(props: { server?: boolean; items: string[] }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<ForLeaf items={props.items} />
		}
	</div>
}

export function TryBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<TryLeaf />
		}
	</div>
}

export function ActivityBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<ActivityLeaf />
		}
	</div>
}

export function BoundaryBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<b class="server">{'server'}</b>
		} @else {
			<BoundaryLeaf />
		}
	</div>
}

// After the rebuild, the cursor rests on server output that the leaf's @if arm
// or @for range would match.
export function ForeignNodeBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<s class="server">{'f'}</s>
			</>
		} @else {
			<IfLeaf on={true} />
		}
	</div>
}

export function ForeignListBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				@for (const x of ['p', 'q']; key x) {
					<s>{x as string}</s>
				}
			</>
		} @else {
			<ForLeaf items={['x', 'y']} />
		}
	</div>
}

// A server sibling after the rebuilt leaf is still adopted.
export function SiblingBranch(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<>
				<b class="server">{'server'}</b>
				<Em />
			</>
		} @else {
			<>
				<IfLeaf on={true} />
				<Em />
			</>
		}
	</div>
}

// The server's seeds belong to its UseEm; the rebuilt leaf's @if arm has none.
export function SeedBranch(props: {
	server?: boolean;
	leaf: Promise<string>;
	sibling: Promise<string>;
}) @{
	<div>
		@try {
			@if (props.server) {
				<>
					<b class="server">{'server'}</b>
					<UseEm value={props.sibling} />
				</>
			} @else {
				<>
					<UseLeaf value={props.leaf} />
					<UseEm value={props.sibling} />
				</>
			}
		} @pending {
			<p>{'pending'}</p>
		}
	</div>
}

// Same element, different block content: genuine structural mismatches inside
// an adopted server element.
export function IfLabel(props: { on: boolean }) @{
	<div>
		<i>
			@if (props.on) {
				<s>{'c'}</s>
			}
			{label() as string}
		</i>
	</div>
}

export function ListLabel(props: { items: string[] }) @{
	<div>
		<i>
			@for (const x of props.items; key x) {
				<s>{x as string}</s>
			}
			{label() as string}
		</i>
	</div>
}
