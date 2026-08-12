// Fixtures for ReactDOMFloat-test.js conformance evidence (slice 2):
// late-discovered Float resources inside streamed Suspense boundaries,
// hoistables authored in Suspense fallbacks, and resource hints issued from
// render/effect timing positions.
import {
	Suspense,
	use,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	preload,
	preinit,
} from 'octane';

// --- Float resources discovered inside a suspended boundary ---------------

function LateSheetInner(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<>
		<link rel="stylesheet" href="/late-sheet.css" precedence="default" />
		<span class="late-ready">{value as string}</span>
	</>
}

export function LateSheetBoundary(props: { promise: Promise<string> }) @{
	<div class="late-host">
		<Suspense fallback={<span class="late-fallback">{'loading...'}</span>}>
			<LateSheetInner promise={props.promise} />
		</Suspense>
	</div>
}

function LateAllInner(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<>
		<link rel="stylesheet" href="/late-all.css" precedence="default" />
		<script async src="/late-all.js" />
		<script async type="module" src="/late-all.mjs" />
		<span class="late-all-ready">{value as string}</span>
	</>
}

export function LateAllBoundary(props: { promise: Promise<string> }) @{
	<div class="late-all-host">
		<Suspense fallback={<span class="late-all-fallback">{'loading...'}</span>}>
			<LateAllInner promise={props.promise} />
		</Suspense>
	</div>
}

// preinit issued inside a suspended boundary, after a shell preload for the
// same hrefs seeded connection options.
function LatePreinitInner(props: { promise: Promise<string> }) @{
	preinit('/late-preinit.css', { as: 'style' });
	preinit('/late-preinit.js', { as: 'script' });
	const value = use(props.promise);
	<span class="late-preinit-ready">{value as string}</span>
}

export function LatePreinitBoundary(props: { promise: Promise<string> }) @{
	<div class="late-preinit-host">
		<Suspense fallback={<span class="late-preinit-fallback">{'loading...'}</span>}>
			<LatePreinitInner promise={props.promise} />
		</Suspense>
	</div>
}

// --- hoistables authored in Suspense fallbacks -----------------------------

function PrimaryMeta(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<>
		<meta name="primary-meta" content="p" />
		<span class="primary">{value as string}</span>
	</>
}

export function FallbackMetaBoundary(props: { promise: Promise<string> }) @{
	<div class="fm-host">
		<Suspense
			fallback={<>
				<meta name="fallback-meta" content="f" />
				<link rel="author" href="/fallback-author" />
				<span class="fb">{'fb'}</span>
			</>}
		>
			<PrimaryMeta promise={props.promise} />
		</Suspense>
	</div>
}

function NestedFallbackPrimary(props: { inner: Promise<string> }) @{
	const value = use(props.inner);
	<>
		<meta name="nested-primary-meta" content="np" />
		<span class="nested-primary">{value as string}</span>
	</>
}

export function NestedFallbackMetaBoundary(props: {
	promise: Promise<string>;
	inner: Promise<string>;
}) @{
	<div class="nfm-host">
		<Suspense
			fallback={<Suspense fallback={<span class="nested-fb">{'nested fb'}</span>}>
				<NestedFallbackPrimary inner={props.inner} />
			</Suspense>}
		>
			<PrimaryMeta promise={props.promise} />
		</Suspense>
	</div>
}

// --- hint calls from render and effect timing positions --------------------

export function RenderAndEffectPreloads() @{
	preload('/pl-render.css', { as: 'style' });
	preload('/pl-font.woff2', { as: 'font', type: 'font/woff2' });
	useInsertionEffect(() => {
		preload('/pl-insertion.js', { as: 'script' });
	}, []);
	useLayoutEffect(() => {
		preload('/pl-layout.woff2', { as: 'font' });
	}, []);
	useEffect(() => {
		preload('/pl-passive.css', { as: 'style' });
	}, []);
	<div class="pl-host">{'hello'}</div>
}

export function EffectPreinitStyle() @{
	useEffect(() => {
		preinit('/effect-preinit.css', { as: 'style' });
	}, []);
	<div class="effect-preinit">{'e'}</div>
}

export function RenderPreinitStyle() @{
	preinit('/render-preinit.css', { as: 'style' });
	<div class="render-preinit-style">{'s'}</div>
}

export function RenderPreinitScript() @{
	preinit('/render-preinit.js', { as: 'script' });
	<div class="render-preinit-script">{'j'}</div>
}

// A component that suspends at the ROOT (no boundary) after issuing a preinit:
// nothing may flush before the shell is ready.
export function RootSuspendedPreinit(props: { promise: Promise<string> }) @{
	preinit('/preamble.js', { as: 'script' });
	const value = use(props.promise);
	<div class="preamble-ready">{value as string}</div>
}
