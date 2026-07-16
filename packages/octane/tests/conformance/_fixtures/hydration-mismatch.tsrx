// Conformance fixtures for the ReactDOMHydrationDiff / ReactDOMServerIntegrationReconnecting
// ports. Each component branches on `props.isClient` — the server renders `isClient={false}`,
// the client hydrates `isClient={true}` — mirroring React's `testMismatch(Mismatch)` /
// `expectMarkupMismatch(server, client)` pattern (a component that renders divergent trees on
// each side). Fixtures are intentionally minimal + focused on one mismatch shape each.
import { useState } from 'octane';

// ── VALUE mismatches ────────────────────────────────────────────────────────

// Text content differs (Per ReactDOMHydrationDiff-test.js:119).
export function TextMismatch(props) @{
	<div class="parent">
		<main class="child">
			{(props.isClient ? 'client' : 'server') as string}
		</main>
	</div>
}

// Two different attributes differ (Per ReactDOMHydrationDiff-test.js:245).
export function AttrMismatch(props) @{
	<div class="parent">
		<main
			class={props.isClient ? 'child client' : 'child server'}
			dir={props.isClient ? 'ltr' : 'rtl'}
		/>
	</div>
}

// Client renders an attribute the server omitted (null → absent) (Per :287).
export function ClientExtraAttr(props) @{
	<div class="parent">
		<main class="child" tabindex={props.isClient ? 1 : null} />
	</div>
}

// Server renders an attribute the client omits (Per :331).
export function ServerExtraAttr(props) @{
	<div class="parent">
		<main class="child" tabindex={props.isClient ? null : 1} />
	</div>
}

// Inline style differs (Per ReactDOMHydrationDiff-test.js:419).
export function StyleMismatch(props) @{
	<div class="parent">
		<main class="child" style={props.isClient ? { color: 'red' } : { color: 'blue' }} />
	</div>
}

// Whitespace-only text difference — must NOT be collapsed away (Per Reconnecting:306).
export function WhitespaceMismatch(props) @{
	<div id="ws">
		{(props.isClient ? 'a b' : 'a  b') as string}
	</div>
}

// ── CLEAN reconnects (no mismatch expected) ─────────────────────────────────

// Identical markup both sides — adopt with no warning (Per Reconnecting:64+).
export function Clean(props) @{
	<div id="clean" class="same" tabindex={0}>
		<span class="leaf">stable</span>
	</div>
}

// Number vs string of the same number → same serialized text, clean (Per Reconnecting:215).
export function NumberString(props) @{
	<div id="numstr">
		{(props.isClient ? 5 : '5') as string}
	</div>
}

// null/false coerce to absent the same on both sides — clean (Per number/null coercion).
export function NullishAttr(props) @{
	<div id="nullish" data-a={props.isClient ? null : null} data-b={props.isClient ? false : false} />
}

// ── suppressHydrationWarning ────────────────────────────────────────────────

// Opt out: keep the server value, no warning (Per Reconnecting:132 "can explicitly ignore").
export function Suppressed(props) @{
	<div id="sup" suppressHydrationWarning>
		{(props.isClient ? 'client' : 'server') as string}
	</div>
}

// ── STRUCTURAL mismatches ───────────────────────────────────────────────────

// Different element type at the same slot (Per Reconnecting:104).
export function ElementTypeMismatch(props) @{
	<div id="etm">
		@if (props.isClient) {
			<article class="x">
				{'hi' as string}
			</article>
		} @else {
			<section class="x">
				{'hi' as string}
			</section>
		}
	</div>
}

// Client renders an extra element as the only child (server rendered none) (Per :533).
export function ClientExtraOnlyChild(props) @{
	<div id="ceoc">
		@if (props.isClient) {
			<span class="extra">
				{'x' as string}
			</span>
		}
	</div>
}

// Client renders an extra element BEFORE a stable sibling (Per :567).
export function ClientExtraBegin(props) @{
	<div id="ceb">
		@if (props.isClient) {
			<br class="extra" />
		}
		<main class="child">
			{'hello' as string}
		</main>
	</div>
}

// Client renders an extra element in the MIDDLE, between two stable siblings (Per :605).
export function ClientExtraMiddle(props) @{
	<div id="cem">
		<main class="a">
			{'A' as string}
		</main>
		@if (props.isClient) {
			<br class="extra" />
		}
		<main class="b">
			{'B' as string}
		</main>
	</div>
}

// Client renders an extra element at the END, after a stable sibling (Per :644).
export function ClientExtraEnd(props) @{
	<div id="cee">
		<main class="a">
			{'A' as string}
		</main>
		@if (props.isClient) {
			<br class="extra" />
		}
	</div>
}

// Server renders an extra element the client omits (Per :834). Natural octane idiom: a
// single-branch `@if` whose condition is false on the client (so the client branch is a null
// body — the server's content must be discarded).
export function ServerExtraElement(props) @{
	<div id="see">
		@if (!props.isClient) {
			<span class="gone">
				{'bye' as string}
			</span>
		}
		<main class="child">
			{'hello' as string}
		</main>
	</div>
}

// A deeper-nested extra node (Per :1521).
export function DeepExtra(props) @{
	<div id="deep">
		<section class="wrap">
			<p class="para">
				@if (props.isClient) {
					<b class="bold">
						{'B' as string}
					</b>
				}
				<span class="tail">
					{'tail' as string}
				</span>
			</p>
		</section>
	</div>
}

// Two DIFFERENT numbers as text — a real mismatch (Per Reconnecting:218). The `number | string`
// union keeps the `as string` cast honest while still exercising number→text coercion.
export function DifferentNumbers(props) @{
	<div id="dn">
		{(props.isClient ? 42 : '7') as string}
	</div>
}

// dangerouslySetInnerHTML differs (Per ReactDOMHydrationDiff-test.js:196 / Reconnecting:405).
export function DangerHtml(props) @{
	<div
		id="dh"
		dangerouslySetInnerHTML={{ __html: props.isClient ? '<i>client</i>' : '<i>server</i>' }}
	/>
}

export function DangerHtmlStructuralServer() @{
	<span id="dh-structural-server">{'server'}</span>
}

export function DangerHtmlStructuralClient() @{
	<div id="dh-structural-client" dangerouslySetInnerHTML={{ __html: '<b>client</b>' }} />
}

export function DetachedTextRenderReplay() @{
	const [step, setStep] = useState(0);
	if (step < 2) setStep(step + 1);
	<section id="detached-text-replay">
		@if (step === 1) {
			<em id="detached-text-transient">{'transient'}</em>
		} @else {
			<span id="detached-text-final">
				{(step === 0 ? 'attempt' : 'final') as string}
			</span>
		}
	</section>
}

// suppressHydrationWarning on an element with a divergent ATTRIBUTE (Per Reconnecting:144).
export function SuppressedAttr(props) @{
	<div id="supa" class={props.isClient ? 'client' : 'server'} suppressHydrationWarning>
		{'x' as string}
	</div>
}

// Component form vs bare-element form of the SAME markup — reconnect clean
// (Per Reconnecting:64-100 "reconnect Pure/Class/Bare to …"). octane has only function
// components + bare elements, so this collapses to func-component ≡ bare element.
function Leaf(props) @{
	<span id="leaf" class="leaf">
		{'ok' as string}
	</span>
}
export function CompForm(props) @{
	<Leaf />
}
export function BareForm(props) @{
	<span id="leaf" class="leaf">
		{'ok' as string}
	</span>
}

// A text mismatch FOLLOWED by a stable, INTERACTIVE sibling — proves hydration continues
// past a mismatch (no throw) and the following sibling still adopts + its handler fires.
export function MismatchThenButton(props) @{
	const [n, setN] = useState(0);
	<div id="mtb">
		<p class="msg">
			{(props.isClient ? 'client' : 'server') as string}
		</p>
		<button id="mtb-btn" onClick={() => setN(n + 1)}>
			{'count:' + n as string}
		</button>
	</div>
}
