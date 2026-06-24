import { useState, createContext, use, memo } from 'octane-ts';

// A module-level render log, mirroring React's `Scheduler.log` global. Tests
// install a sink before mounting and drain it after each commit. Using a
// module-level sink (rather than a `log` prop) is what lets memo boundaries
// receive genuinely-stable props and bail out on a no-op re-render — exactly
// how ReactNewContext-test.js structures these cases (the consumers/indirection
// take no changing props; logging is a side-channel).
let SINK: ((s: string) => void) | null = null;
export function setSink(fn: ((s: string) => void) | null): void {
	SINK = fn;
}
function log(s: string): void {
	SINK?.(s);
}

const Ctx = createContext(0);

// ---------------------------------------------------------------------------
// Case A — consumers bail out if the context value is the same (ReactNewContext
// -test.js:218). A memo'd consumer behind stable props must NOT re-run its body
// when the Provider re-commits an Object.is-equal value.
// ---------------------------------------------------------------------------
function ConsumerImpl() @{
	const value = use(Ctx);
	log('Consumer:' + value);
	<span class="consumer">{value as string}</span>
}
const Consumer = memo(ConsumerImpl);

// Two memo'd Indirection layers (React uses `shouldComponentUpdate === false`
// class Indirections). They take no props, so a re-render of App with the same
// value lets them bail; only when the context value changes does the cascade
// reach the Consumer.
function InnerIndirectionImpl() @{
	log('Indirection');
	<Consumer />
}
const InnerIndirection = memo(InnerIndirectionImpl);

function OuterIndirectionImpl() @{
	log('Indirection');
	<InnerIndirection />
}
const OuterIndirection = memo(OuterIndirectionImpl);

export function App(props) @{
	log('App');
	<div id="app-same">
		<Ctx.Provider value={props.value}>
			<OuterIndirection />
		</Ctx.Provider>
	</div>
}

// ---------------------------------------------------------------------------
// Case B — consumer bails out if value is unchanged AND something above bailed
// out, but re-renders when the value DOES change (ReactNewContext-test.js:624).
// A memo'd "PureIndirection" wraps two consumers; one captures the render
// callback inline, one caches it. On a same-value re-render PureIndirection
// bails; on a changed value the cascade still reaches both consumers.
// ---------------------------------------------------------------------------
function InlineConsumerImpl() @{
	const value = use(Ctx);
	log('Consumer');
	<span class="inline">{value as string}</span>
}
const InlineConsumer = memo(InlineConsumerImpl);

function CachedConsumerImpl() @{
	const value = use(Ctx);
	log('Consumer');
	<span class="cached">{value as string}</span>
}
const CachedConsumer = memo(CachedConsumerImpl);

function PureIndirectionImpl() @{
	log('PureIndirection');
	<>
		<InlineConsumer />
		<CachedConsumer />
	</>
}
const PureIndirection = memo(PureIndirectionImpl);

export function AppIndirect(props) @{
	log('App');
	<div id="app-indirect">
		<Ctx.Provider value={props.value}>
			<PureIndirection />
		</Ctx.Provider>
	</div>
}

// ---------------------------------------------------------------------------
// Case C — a context change does not skip some sibling consumers (ReactNew
// Context-test.js:776, regression for facebook/react#12686). A memo'd
// StaticContent sibling sits before a conditionally-mounted consumer; bumping
// the Provider value must re-render the consumer (and any siblings) without
// re-rendering the static (bailed-out) sibling.
// ---------------------------------------------------------------------------
function SibConsumerImpl() @{
	const value = use(Ctx);
	log('Consumer');
	<span class="sib">{value as string}</span>
}
const SibConsumer = memo(SibConsumerImpl);

function StaticContentImpl() @{
	log('Static');
	<>
		<span class="s1">{'static 1'}</span>
		<span class="s2">{'static 2'}</span>
	</>
}
const StaticContent = memo(StaticContentImpl);

export function AppSiblings(props) @{
	const [step, setStep] = useState(0);
	log('App');
	<div id="app-siblings">
		<button id="bump" onClick={() => setStep(step + 1)}>{'bump'}</button>
		<Ctx.Provider value={step}>
			<StaticContent />
			@if (step > 0) {
				<SibConsumer />
			}
		</Ctx.Provider>
	</div>
}

// ---------------------------------------------------------------------------
// Case D — a context change must descend through @for and @if branches that sit
// under a BAILED-OUT memo boundary, not just direct componentSlot children. The
// memo'd ListWrapper bails on stable props; the refresh has to walk its for-loop
// item blocks AND its @if branch block to reach the consumers inside.
// ---------------------------------------------------------------------------
function RowImpl(props) @{
	const value = use(Ctx);
	log('Row:' + props.id);
	<li class={('row-' + props.id) as string}>{value as string}</li>
}
const Row = memo(RowImpl);

function ListWrapperImpl(props) @{
	log('ListWrapper');
	<ul>
		@for (const id of props.ids; key id) {
			<Row id={id} />
		}
		@if (props.showExtra) {
			<li class="extra">{use(Ctx) as string}</li>
		}
	</ul>
}
const ListWrapper = memo(ListWrapperImpl);

export function AppList(props) @{
	log('App');
	<div id="app-list">
		<Ctx.Provider value={props.value}>
			<ListWrapper ids={props.ids} showExtra={true} />
		</Ctx.Provider>
	</div>
}
