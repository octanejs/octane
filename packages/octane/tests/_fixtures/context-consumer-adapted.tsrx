// Adapted ports of React's Context.Consumer scenarios. Octane has no render-
// prop Consumer (decision recorded in issue #711: modern callable context +
// slot-keyed hooks make use()/useContext legal behind any condition), so each
// "consumer" is a component reading via useContext/use. The observable
// contracts — defaults, propagation across branches, bailout, hidden subtrees,
// suspended boundaries — are what the ports assert.
import { Activity, Suspense, createContext, memo, use, useContext } from 'octane';

// Module-level render log mirroring React's `Scheduler.log` (see
// context-bailout.tsrx for why a sink beats a prop: memo boundaries keep
// genuinely-stable props and can bail out).
let SINK: ((s: string) => void) | null = null;
export function setSink(fn: ((s: string) => void) | null): void {
	SINK = fn;
}
function log(s: string): void {
	SINK?.(s);
}

const Ctx = createContext('default');

function ReaderImpl(props: { tag: string }) @{
	const value = useContext(Ctx);
	log('Reader:' + props.tag + ':' + value);
	<span class={'r-' + props.tag}>{value as string}</span>
}
const Reader = memo(ReaderImpl);

// Per ReactNewContext-test.js:343 — 'should provide the correct (default)
// values to consumers outside of a provider'.
export function DefaultOutside() @{
	<div class="out">
		<Reader tag="out" />
	</div>
}

// Per ReactNewContext-test.js:381 — 'multiple consumers in different branches'.
export function Branches(props: { value: string }) @{
	<div class="branches">
		<Ctx.Provider value={props.value}>
			<section class="b1">
				<Reader tag="b1" />
			</section>
			<section class="b2">
				<div>
					<Reader tag="b2" />
				</div>
			</section>
		</Ctx.Provider>
	</div>
}

// Per ReactContextPropagation-test.js:299 — 'context consumer bails out if
// context hasn't changed'.
function ShellImpl() @{
	log('Shell');
	<Reader tag="p" />
}
const Shell = memo(ShellImpl);

export function PropagationBail(props: { value: string }) @{
	log('Root');
	<div class="prop-bail">
		<Ctx.Provider value={props.value}>
			<Shell />
		</Ctx.Provider>
	</div>
}

// Per ReactContextPropagation-test.js:892 — 'finds context consumers in
// multiple sibling branches'.
function Sib1Impl() @{
	log('Sib1');
	<Reader tag="s1" />
}
const Sib1 = memo(Sib1Impl);
function Sib2Impl() @{
	log('Sib2');
	<Reader tag="s2" />
}
const Sib2 = memo(Sib2Impl);
function Sib3Impl() @{
	log('Sib3');
	<Reader tag="s3" />
}
const Sib3 = memo(Sib3Impl);

export function Siblings(props: { value: string }) @{
	<div class="siblings">
		<Ctx.Provider value={props.value}>
			<Sib1 />
			<Sib2 />
			<Sib3 />
		</Ctx.Provider>
	</div>
}

// Per ReactNewContext-test.js:706 — 'context consumer doesn't bail out inside
// hidden subtree'.
export function HiddenHost(props: { value: string; mode: string }) @{
	<div class="hidden-host">
		<Ctx.Provider value={props.value}>
			<Activity mode={props.mode as 'visible' | 'hidden'}>
				<Reader tag="hidden" />
			</Activity>
		</Ctx.Provider>
	</div>
}

// Per ReactNewContext-test.js:1135 — 'consumer does not bail out if there were
// no bailouts above it' (a plain, memo-free chain re-renders through).
function PlainReader() @{
	const value = useContext(Ctx);
	log('Plain:' + value);
	<span class="plain">{value as string}</span>
}

function Middle() @{
	log('Middle');
	<PlainReader />
}

export function NoBailouts(props: { value: string }) @{
	log('NB');
	<div class="no-bail">
		<Ctx.Provider value={props.value}>
			<Middle />
		</Ctx.Provider>
	</div>
}

// Per ReactSuspense-test.internal.js:1410 — 'updates context consumer within
// child of suspended suspense component when context updates'.
function Sus(props: { promise: Promise<string> }) @{
	const v = use(props.promise);
	<i class="sus">{v as string}</i>
}

export function SuspendedHost(props: { value: string; promise: Promise<string> }) @{
	<div class="sus-host">
		<Ctx.Provider value={props.value}>
			<Suspense fallback="waiting">
				<Sus promise={props.promise} />
				<Reader tag="sus" />
			</Suspense>
		</Ctx.Provider>
	</div>
}
