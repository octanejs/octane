import {
	Activity,
	createContext,
	hostComponent,
	memo,
	use,
	useContext,
	type ComponentBody,
	type OctaneNode,
	type Scope,
} from 'octane';

const Identity = createContext({ label: 'default' });

function Grandchild(props: { id: string }) @{
	const identity = useContext(Identity);
	<output data-owner={props.id}>{identity.label as string}</output>
}

function Middle(props: { id: string }) @{
	<section>
		<Grandchild id={props.id} />
	</section>
}

function View(props: { id: string }) @{
	<article>
		<Middle id={props.id} />
	</article>
}
const MemoView = memo(View);

export function AppLite(props: {
	memoized: boolean;
	identity: { label: string };
	active: string;
	retained: { id: string }[];
}) @{
	<Identity value={props.identity}>
		@for (const item of props.retained; key item.id) {
			<Activity mode={item.id === props.active ? 'visible' : 'hidden'}>
				@if (props.memoized) {
					<MemoView id={item.id} />
				} @else {
					<View id={item.id} />
				}
			</Activity>
		}
	</Identity>
}

function PromotionConsumer() @{
	const identity = useContext(Identity);
	<div>
		<input id="promotion-draft" defaultValue="draft" />
		<output id="promotion-value">{identity.label as string}</output>
	</div>
}

function PromotionMiddle(props: { title: () => string }) @{
	<section title={props.title()}>
		<PromotionConsumer />
	</section>
}

function promotionTitle() {
	return 'retained context';
}

// A manual host binding gives its compiled children a distinct scope while
// preserving the surrounding component's owner, as library bindings do.
function PromotionHost(props: { children?: OctaneNode }, scope: Scope) {
	hostComponent(scope, 0, 'article', null, props.children);
}

export function PromotionTree() @{
	<PromotionHost>
		<PromotionMiddle title={promotionTitle} />
	</PromotionHost>
}
export const MemoPromotionTree = memo(PromotionTree);

function PromotionGate(props: { promise?: PromiseLike<unknown> }) @{
	if (props.promise !== undefined) use(props.promise);
	<span id="promotion-tail" />
}

export function PromotionLazyShell(props: {
	Target: ComponentBody;
	identity: { label: string };
	promise?: PromiseLike<unknown>;
}) @{
	<Identity value={props.identity}>
		<div>
			<props.Target />
			<PromotionGate promise={props.promise} />
		</div>
	</Identity>
}

export function PromotionBodyShell(props: { identity: { label: string }; child: OctaneNode }) @{
	<Identity value={props.identity}>
		<main>{props.child}</main>
	</Identity>
}

type PromotionCapture = { capture: (body: ComponentBody) => void };

function CaptureChildren(props: PromotionCapture & { children?: OctaneNode }) {
	// This local caller supplies compiled children, which use the component-body ABI.
	props.capture(props.children as ComponentBody);
	return null;
}

export function CapturePromotionChildren(props: PromotionCapture) @{
	<CaptureChildren capture={props.capture}>
		<PromotionTree />
	</CaptureChildren>
}
