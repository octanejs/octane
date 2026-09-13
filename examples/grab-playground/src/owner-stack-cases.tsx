/** @jsxImportSource octane */
import { memo, Suspense, createPortal, createContext, type OctaneNode } from 'octane';

const ProductionContext = createContext('vite');

export function ProductionProvider(props: { children?: OctaneNode }) {
	return <ProductionContext.Provider value="vite">{props.children}</ProductionContext.Provider>;
}

interface ChildrenProps {
	children?: OctaneNode;
}

interface ElementChildProps {
	children: OctaneNode;
}

interface RenderPropProps {
	children: () => OctaneNode;
}

function StructuralWrapper(props: ChildrenProps) {
	return (
		<div data-testid="owner-structural-wrapper">
			<span data-testid="wrapper-owned-target">Wrapper-owned target</span>
			{props.children}
		</div>
	);
}

function PassthroughOwner() {
	return (
		<StructuralWrapper>
			<button data-testid="passthrough-owner-target" type="button">
				Passthrough owner target
			</button>
		</StructuralWrapper>
	);
}

/** Upstream uses cloneElement; Octane has no cloneElement — render the child as authored. */
function CloningWrapper(props: ElementChildProps) {
	return <>{props.children}</>;
}

function CloneOwner() {
	return (
		<CloningWrapper>
			<button data-testid="clone-owner-target" type="button">
				Clone owner target
			</button>
		</CloningWrapper>
	);
}

function RenderPropWrapper(props: RenderPropProps) {
	return <div>{props.children()}</div>;
}

function RenderPropOwner() {
	return (
		<RenderPropWrapper>
			{() => (
				<button data-testid="render-prop-owner-target" type="button">
					Render prop owner target
				</button>
			)}
		</RenderPropWrapper>
	);
}

function PortalOwner() {
	return createPortal(
		<button data-testid="portal-owner-target" type="button">
			Portal owner target
		</button>,
		document.body,
	);
}

const MemoLeaf = memo(function MemoLeaf() {
	return (
		<button data-testid="memo-owner-target" type="button">
			Memo owner target
		</button>
	);
});

function DirectOwner() {
	return (
		<button data-testid="direct-owner-target" type="button">
			Direct owner target
		</button>
	);
}

function FragmentOwner() {
	return (
		<>
			<button data-testid="fragment-owner-target" type="button">
				Fragment owner target
			</button>
		</>
	);
}

function SuspenseOwner() {
	return (
		<Suspense fallback={<span>Loading owner target</span>}>
			<button data-testid="suspense-owner-target" type="button">
				Suspense owner target
			</button>
		</Suspense>
	);
}

function DuplicateContextOwner() {
	return (
		<div>
			<button className="duplicate-context-target" type="button">
				<span>Repeated action</span>
			</button>
			<button className="duplicate-context-target" type="button">
				<span>Repeated action</span>
			</button>
		</div>
	);
}

function GeneratedIdOwner() {
	return (
		<>
			<button className="generated-id-only-target" id=":r0:" type="button">
				Generated ID target
			</button>
			<button
				data-testid="generated-id-semantic-target"
				id="550e8400-e29b-41d4-a716-446655440000"
				type="button"
			>
				Generated ID with semantic attribute
			</button>
			<button data-testid="semantic-ancestor-target" type="button">
				<span id=":r2:">
					<span className="nested-generated-id-target">Nested generated ID target</span>
				</span>
			</button>
			<button aria-label="Unique semantic ancestor" type="button">
				<span data-testid="repeated-semantic-candidate">
					<span className="nested-repeated-semantic-target">Nested repeated semantic target</span>
				</span>
			</button>
			<button aria-label="Other semantic ancestor" type="button">
				<span data-testid="repeated-semantic-candidate">Other repeated semantic target</span>
			</button>
			<div data-testid="generic-control-semantic-ancestor">
				<button type="button">
					<span className="generic-control-nested-target">Nested generic control target</span>
				</button>
			</div>
		</>
	);
}

function ProductionIconLink() {
	return (
		<a
			aria-label="Production GitHub link"
			data-testid="production-icon-link"
			href="https://github.com/aidenybai/react-grab"
		>
			<svg height="24" role="img" viewBox="0 0 24 24" width="24">
				<g>
					<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Z" />
				</g>
			</svg>
		</a>
	);
}

export function OwnerStackCases() {
	return (
		<ProductionProvider>
			<section data-testid="owner-stack-cases">
				<DirectOwner />
				<PassthroughOwner />
				<CloneOwner />
				<RenderPropOwner />
				<PortalOwner />
				<MemoLeaf />
				<FragmentOwner />
				<SuspenseOwner />
				<DuplicateContextOwner />
				<GeneratedIdOwner />
				<ProductionIconLink />
				<button data-testid="single-key-target" key="only" type="button">
					Single keyed target
				</button>
				<button data-testid="list-key-target-first" key="first" type="button">
					First keyed target
				</button>
				<button data-testid="list-key-target-second" key="second" type="button">
					Second keyed target
				</button>
				<button data-testid="escaped-key-target" key={'item:"two"\nnext'} type="button">
					Escaped key target
				</button>
				<button key="escaped-key-sibling" type="button">
					Escaped key sibling
				</button>
				<button className="structural-selector-target" key="fragment-first" type="button">
					First fragment keyed target
				</button>
				<button data-testid="fragment-key-target" key="fragment-second" type="button">
					Second fragment keyed target
				</button>
			</section>
		</ProductionProvider>
	);
}
