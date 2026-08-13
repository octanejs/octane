// Fixtures for conformance/float-evidence-1.test.ts — ReactDOMFloat-test.js
// evidence ports. Each component is cited from the test file; the contracts
// under test are React Float resource semantics adapted to Octane's model
// (resources are global, hoisted, deduped, precedence-grouped, retained).
import { preload, preinit, use, useState } from 'octane';

// Same-commit release + acquire of one script resource identity: the @if flip
// unmounts the first <script async src> site and mounts a second one carrying
// a differing prop in the same commit.
let swapPhase: ((phase: number) => void) | null = null;
export function setSwapPhase(phase: number): void {
	swapPhase!(phase);
}

export function ScriptSwapHost() @{
	const [phase, setPhase] = useState(0);
	swapPhase = setPhase;
	<section class="swap">
		@if (phase === 0) {
			<>
				<script async src="/swap.js" />
				<span class="swap-a">a</span>
			</>
		} @else {
			<>
				<script async src="/swap.js" data-new="new" />
				<span class="swap-b">b</span>
			</>
		}
	</section>
}

// Mixed head content: hoisted non-resource metadata AND Float resources from
// one component tree (adapted from React's whole-document hydration case).
export function MixedHead() @{
	<>
		<title>mixed head</title>
		<meta property="og:mixed" content="bar" />
		<link rel="stylesheet" href="/mixed.css" precedence="default" />
		<script async src="/mixed.js" />
		<main class="mixed-body">{'mixed' as string}</main>
	</>
}

// Sibling dynamic texts, each followed by a stylesheet resource that is elided
// from the inline HTML (React's text-separator case, adapted).
function TextWithSheet(props: { text: string; href: string; precedence: string }) @{
	<>
		{props.text as string}
		<link rel="stylesheet" href={props.href} precedence={props.precedence} />
	</>
}

export function TextResourceSiblings() @{
	<div class="text-siblings">
		<TextWithSheet text="foo" href="/sep-foo.css" precedence="one" />
		<TextWithSheet text="bar" href="/sep-bar.css" precedence="two" />
		<TextWithSheet text="baz" href="/sep-baz.css" precedence="three" />
	</div>
}

// Precedence normalization across nested non-suspended boundaries rendered in
// one pass (React's shell-flush normalization case, adapted).
export function ShellPrecedenceApp() @{
	<div class="shell-prec">
		{'outer' as string}
		<link rel="stylesheet" href="/1one.css" precedence="one" />
		<link rel="stylesheet" href="/1two.css" precedence="two" />
		@try {
			<>
				{'middle' as string}
				<link rel="stylesheet" href="/2one.css" precedence="one" />
				<link rel="stylesheet" href="/2two.css" precedence="two" />
				@try {
					<>
						{'inner' as string}
						<link rel="stylesheet" href="/3three.css" precedence="three" />
						<link rel="stylesheet" href="/3one.css" precedence="one" />
					</>
				} @pending {
					<span class="p-inner">pending</span>
				}
			</>
		} @pending {
			<span class="p-mid">pending</span>
		}
	</div>
}

// Streamed precedence normalization: an initial sheet, a preinit with a preset
// precedence, and two PENDING boundaries whose statically-declared sheets must
// still make the flushed shell head (adapted from React's late-hoist case; the
// load-gated client reveal half of that case is out of scope with suspensey
// commits).
export function PendingPrecedenceApp(props: { a: Promise<string>; b: Promise<string> }) @{
	preinit('/pp-preset.css', { as: 'style', precedence: 'preset' });
	<div class="pending-prec">
		<link rel="stylesheet" href="/pp-initial.css" precedence="one" />
		@try {
			const va = use(props.a);
			<>
				<link rel="stylesheet" href="/pp-a.css" precedence="default" />
				<span class="pp-a">{va as string}</span>
			</>
		} @pending {
			<span class="pp-a-pending">loading a</span>
		}
		@try {
			const vb = use(props.b);
			<>
				<link rel="stylesheet" href="/pp-b.css" precedence="one" />
				<span class="pp-b">{vb as string}</span>
			</>
		} @pending {
			<span class="pp-b-pending">loading b</span>
		}
	</div>
}

// Full option/attribute surface on a stylesheet resource: standard link
// options, a data attribute whose value needs escaping, and the canonical
// lowercase serialization.
// Module-level so the double quotes stay an expression value (a literal
// attribute would trip the tsrx-prettier attribute rewrite) and stay visible
// to the hoisted resource emission (a component-local would sit in its TDZ).
const quoted = '"quoted"';

export function AttrSheet() @{
	<>
		<link
			rel="stylesheet"
			href="/attr.css"
			precedence="default"
			crossOrigin="anonymous"
			media="all"
			integrity="somehash"
			referrerPolicy="origin"
			data-foo={quoted}
		/>
		<span class="attr-body">attrs</span>
	</>
}

// nomodule scripts: the async form is still a hoisted resource carrying the
// attribute; the sync form stays an ordinary in-place element.
export function NoModuleScripts() @{
	<div class="nomodule-host">
		<script src="/nomodule-sync.js" noModule data-meaningful="" />
		<script async src="/nomodule-async.js" noModule data-meaningful="" />
	</div>
}

// A precedence link loses Float resource semantics whenever its href cannot
// identify a stylesheet or its author owns the loading/disabled lifecycle.
export function PrecedenceWithoutHref() @{
	<section class="invalid-precedence-host">
		<link rel="stylesheet" precedence="default" />
	</section>
}

export function PrecedenceWithEmptyHref() @{
	<section class="invalid-precedence-host">
		<link rel="stylesheet" href="" precedence="default" />
	</section>
}

export function PrecedenceWithLoadHandler(props: { onLoad: () => void }) @{
	<section class="invalid-precedence-host">
		<link rel="stylesheet" href="/precedence-load.css" precedence="default" onLoad={props.onLoad} />
	</section>
}

export function PrecedenceWithErrorHandler(props: { onError: () => void }) @{
	<section class="invalid-precedence-host">
		<link
			rel="stylesheet"
			href="/precedence-error.css"
			precedence="default"
			onError={props.onError}
		/>
	</section>
}

export function PrecedenceWithBothHandlers(props: { onLoad: () => void; onError: () => void }) @{
	<section class="invalid-precedence-host">
		<link
			rel="stylesheet"
			href="/precedence-both.css"
			precedence="default"
			onLoad={props.onLoad}
			onError={props.onError}
		/>
	</section>
}

export function PrecedenceWithDisabledFalse() @{
	<section class="invalid-precedence-host">
		<link
			rel="stylesheet"
			href="/precedence-disabled-false.css"
			precedence="default"
			disabled={false}
		/>
	</section>
}

export function PrecedenceWithDisabledTrue() @{
	<section class="invalid-precedence-host">
		<link rel="stylesheet" href="/precedence-disabled-true.css" precedence="default" disabled />
	</section>
}

export function PrecedenceResourceControl() @{
	<section class="valid-precedence-host">
		<link rel="stylesheet" href="/precedence-valid.css" precedence="default" />
	</section>
}

export function DynamicPrecedenceResourceControl(props: { href: string }) @{
	<section class="dynamic-precedence-host">
		<link rel="stylesheet" href={props.href} precedence="default" />
	</section>
}

export function PreloadedStyleResource() @{
	preload('/inline-collision.css', { as: 'style' });
	<>
		<style href="/inline-collision.css" precedence="default">
			.inline-collision {
				color: red;
			}
		</style>
		<main class="inline-collision">collision</main>
	</>
}

export function PreloadedExternalStylesheet() @{
	preload('/external-control.css', { as: 'style' });
	<>
		<link rel="stylesheet" href="/external-control.css" precedence="default" />
		<main class="external-control">external</main>
	</>
}

export function StyleResourceWithWhitespace() @{
	<>
		<style href="inline style key" precedence="default">
			.whitespace-style-key {
				color: blue;
			}
		</style>
		<main class="whitespace-style-key">whitespace</main>
	</>
}

export function StyleResourceWithoutWhitespace() @{
	<>
		<style href="inline-style-key" precedence="default">
			.valid-style-key {
				color: green;
			}
		</style>
		<main class="valid-style-key">valid</main>
	</>
}
