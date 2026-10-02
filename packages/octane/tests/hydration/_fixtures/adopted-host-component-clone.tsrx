const LABEL = 'ok';

function label(): string {
	return 'ok';
}

function Leaf() @{
	<i>{label() as string}</i>
}

function OtherLeaf() @{
	<u>{label() as string}</u>
}

// A module constant prop keeps these calls on the lite component slot.
function LiteLeaf(props: { text: string }) @{
	<i>{props.text as string}</i>
}

function OtherLiteLeaf(props: { text: string }) @{
	<u>{props.text as string}</u>
}

function FragmentLeaf() @{
	<>
		<i>{label() as string}</i>
		<em>{'a'}</em>
	</>
}

function OtherFragmentLeaf() @{
	<>
		<u>{label() as string}</u>
		<em>{'b'}</em>
	</>
}

// The server renders the first arm and the client the second. Hydration adopts
// the <section>, whose only children are anchorless component calls, while its
// server children are the other arm's.
export function ElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section>
				<b class="server">{'server'}</b>
				<s>{'x'}</s>
			</section>
		} @else {
			<section>
				<Leaf />
			</section>
		}
	</div>
}

export function LiteElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section>
				<b class="server">{'server'}</b>
				<s>{'x'}</s>
			</section>
		} @else {
			<section>
				<LiteLeaf text={LABEL} />
			</section>
		}
	</div>
}

// The arm's clone parks the cursor on the <article>, an ancestor of the host.
export function NestedElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<article>
				<section>
					<b class="server">{'server'}</b>
					<s>{'x'}</s>
				</section>
			</article>
		} @else {
			<article>
				<section>
					<Leaf />
				</section>
			</article>
		}
	</div>
}

export function LiteNestedElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<article>
				<section>
					<b class="server">{'server'}</b>
					<s>{'x'}</s>
				</section>
			</article>
		} @else {
			<article>
				<section>
					<LiteLeaf text={LABEL} />
				</section>
			</article>
		}
	</div>
}

export function SiblingElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section>
				<b class="server">{'server'}</b>
				<s>{'x'}</s>
			</section>
		} @else {
			<section>
				<Leaf />
				<OtherLeaf />
			</section>
		}
	</div>
}

export function LiteSiblingElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section>
				<b class="server">{'server'}</b>
				<s>{'x'}</s>
			</section>
		} @else {
			<section>
				<LiteLeaf text={LABEL} />
				<OtherLiteLeaf text={LABEL} />
			</section>
		}
	</div>
}

export function FragmentSiblingElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section>
				<b class="server">{'server'}</b>
				<s>{'x'}</s>
			</section>
		} @else {
			<section>
				<FragmentLeaf />
				<OtherFragmentLeaf />
			</section>
		}
	</div>
}

// The server leaves the adopted element empty.
export function EmptyElementHost(props: { server?: boolean }) @{
	<div>
		@if (props.server) {
			<section></section>
		} @else {
			<section>
				<Leaf />
			</section>
		}
	</div>
}
