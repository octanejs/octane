import { descriptorChildren, isChildrenBlock } from 'octane';

export function Ordinary(props: { children?: unknown }) @{
	<span data-children-kind={isChildrenBlock(props.children) ? 'block' : 'descriptor'} />
}

const Marked = descriptorChildren(Ordinary);

export function MarkedChildren() @{
	<Marked>
		<button>marked</button>
	</Marked>
}

export function ParameterShadowedChildren(Marked: typeof Ordinary) @{
	<Marked>
		<button>parameter</button>
	</Marked>
}

export function BlockShadowedChildren(props: { ordinary: boolean }) @{
	<main>
		@if (props.ordinary) {
			const Marked = Ordinary;
			<Marked>
				<button>block</button>
			</Marked>
		} @else {
			<Marked>
				<button>marked</button>
			</Marked>
		}
	</main>
}

export function ScopedShadowedChildren(Marked: typeof Ordinary) @{
	<div>
		<style>
			div {
				color: red;
			}
		</style>
		<Marked>
			<button>scoped</button>
		</Marked>
	</div>
}

export function LoopShadowedChildren() @{
	<main>
		@for (const Marked of [Ordinary]; key Marked) {
			<Marked>
				<button>loop</button>
			</Marked>
		}
		<Marked>
			<button>outside</button>
		</Marked>
	</main>
}

export function LoopMarkedChildren() @{
	<main>
		@for (const label of ['one']; key label) {
			<Marked>
				<button>{label}</button>
			</Marked>
		}
	</main>
}
