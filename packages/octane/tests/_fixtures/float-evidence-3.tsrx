// ReactDOMFloat-test.js conformance evidence (slice 3) fixtures: preinit
// option pass-through (nonce/integrity/module options), Float classification
// exclusions (SVG and noscript contexts, handler-bearing scripts), unusual
// href text, style-resource nonce, and hoistable link/title lifecycle.
import { useEffect, preinit, preinitModule } from 'octane';

// preinit issued OUTSIDE render (from an effect) still creates the resource.
export function EffectPreinit() @{
	useEffect(() => {
		preinit('/fe3-effect.js', { as: 'script' });
	}, []);
	<div class="fe3-fx">{'FX' as string}</div>
}

export function NonceScriptPreinit(props: { src: string }) @{
	preinit(props.src, { as: 'script', nonce: 'R4nD0m' });
	<div class="fe3-nonce">{'hello' as string}</div>
}

export function IntegrityScriptPreinit(props: { src: string; hash: string }) @{
	preinit(props.src, { as: 'script', integrity: props.hash });
	<div class="fe3-int-script">{'hello' as string}</div>
}

export function IntegrityStylePreinit(props: { src: string; hash: string }) @{
	preinit(props.src, { as: 'style', integrity: props.hash });
	<div class="fe3-int-style">{'hello' as string}</div>
}

export function ModulePreinits() @{
	preinitModule('/fe3-mod-default.mjs', { as: 'script' });
	preinitModule('/fe3-mod-integrity.mjs', { integrity: 'some hash' });
	<div class="fe3-mod">{'hello' as string}</div>
}

// Stylesheet resources whose href text would be CSS-selector syntax if a
// matching implementation interpolated it into querySelector. Module
// constants keep the expression containers (a quote-bearing string cannot be
// a plain JSX string attribute).
export const QUOTE_HREF: string = 'fe3-style"][rel="stylesheet';
export const SLASH_HREF: string = 'fe3-with\\slashes';

export function EscapedSheetQuote() @{
	<>
		<link rel="stylesheet" href={QUOTE_HREF} precedence="style" />
		<div class="fe3-esc-q">{'q' as string}</div>
	</>
}

export function EscapedSheetBackslash() @{
	<>
		<link rel="stylesheet" href={SLASH_HREF} precedence="style" />
		<div class="fe3-esc-b">{'b' as string}</div>
	</>
}

// SVG context: script-resource classification and title hoisting are
// suppressed inside the SVG namespace (both stay in their authored
// positions), while a <foreignObject> subtree returns to HTML rules and
// hoists metadata and resources again.
export function SvgContexts() @{
	<section class="fe3-svg-host">
		<svg class="fe3-svg">
			<path class="fe3-svg-path">
				<title>svg inline title</title>
				<script async src="/fe3-svg-script.js" />
			</path>
			<foreignObject>
				<meta name="fe3-fo-meta" content="hoist" />
				<link rel="stylesheet" href="/fe3-fo-sheet.css" precedence="default" />
				<script async src="/fe3-fo-script.js" />
			</foreignObject>
		</svg>
	</section>
}

// noscript is fallback-only content: an async script inside it is never a
// script resource.
export function NoscriptScript() @{
	<div class="fe3-nss">
		<noscript>
			<script async src="/fe3-noscript.js" />
		</noscript>
		<p class="fe3-nss-p">{'ns' as string}</p>
	</div>
}

// Only the handler-free async external script is a resource; scripts with
// load handlers, plain scripts, and defer scripts stay per-site elements.
export function ScriptForms(props: { onLoad: () => void }) @{
	<section class="fe3-scripts">
		<script async src="/fe3-resource.js" />
		<script async src="/fe3-handler.js" onLoad={props.onLoad} />
		<script src="/fe3-plain.js" data-meaningful="" />
		<script defer src="/fe3-defer.js" data-meaningful="" />
		<span class="fe3-scripts-span">{'hello world' as string}</span>
	</section>
}

// A style resource carrying an authored CSP nonce.
export function NonceStyle() @{
	<>
		<style href="fe3-nonce-css" precedence="default" nonce="R4nD0m">
			.fe3-nonce-rule {
				color: hotpink;
			}
		</style>
		<div class="fe3-nonce-style">{'n' as string}</div>
	</>
}

// A plain (non-stylesheet) hoisted link: per-site head element on both sides.
export function PlainLinkPage() @{
	<>
		<link rel="author" data-foo="data" href="/fe3-author" />
		<main class="fe3-plain-host">{'body' as string}</main>
	</>
}

// A hoisted title whose text AND attribute update reactively in place.
export function TitleUpdate(props: { text: string; foo: string }) @{
	<>
		<title data-foo={props.foo}>{props.text as string}</title>
		<main class="fe3-title-host">{'t' as string}</main>
	</>
}

// Head content authored in deliberately unprioritized order: charset last,
// viewport second-to-last, ordinary metadata first.
export function PriorityHead() @{
	<>
		<link rel="alternate" href="/fe3-feed.xml" />
		<meta name="bar" content="b" />
		<title>a title</title>
		<link rel="preconnect" href="/fe3-bar" />
		<meta name="viewport" content="width=device-width" />
		<meta charSet="utf-8" />
		<main class="fe3-priority-host">{'p' as string}</main>
	</>
}
