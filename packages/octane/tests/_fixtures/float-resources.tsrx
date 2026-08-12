// React Float resource fixtures: precedence stylesheets and async scripts
// rendered at a component's body root (the same placement contract as hoisted
// <title>/<meta>/<link>) become global resources — deduped by href/src,
// precedence-grouped in document.head, and retained after unmount.
import { useState } from 'octane';

export function SheetA() @{
	<>
		<link rel="stylesheet" href="/base.css" precedence="default" />
		<div class="a">{'A' as string}</div>
	</>
}

export function SheetADuplicate() @{
	<>
		<link rel="stylesheet" href="/base.css" precedence="default" />
		<div class="a2">{'A2' as string}</div>
	</>
}

// `<style href precedence>` = a Float STYLE RESOURCE: plain CSS shipped by
// href identity, sharing the stylesheet dedupe/precedence model with links.
export function StyleRes() @{
	<>
		<style href="inline-tokens" precedence="default">
			.tokens {
				color: teal;
			}
		</style>
		<div class="sr">{'SR' as string}</div>
	</>
}

export function StyleResDuplicate() @{
	<>
		<style href="inline-tokens" precedence="default">
			.tokens {
				color: teal;
			}
		</style>
		<div class="sr2">{'SR2' as string}</div>
	</>
}

export function StyleResHigh() @{
	<>
		<style href="inline-high" precedence="high" media="screen">
			.hi-tokens {
				color: crimson;
			}
		</style>
		<div class="srh">{'SRH' as string}</div>
	</>
}

// Control: a bare `<style>` (no href/precedence) stays with SCOPED CSS — its
// selectors scope to the component hash and no head resource appears.
export function ScopedControl() @{
	<>
		<style>
			.scoped {
				color: rebeccapurple;
			}
		</style>
		<div class="scoped" id="scoped-control">{'SC' as string}</div>
	</>
}

export function SheetHigh() @{
	<>
		<link rel="stylesheet" href="/high.css" precedence="high" crossOrigin="anonymous" />
		<div class="hi">{'HI' as string}</div>
	</>
}

export function SheetLate() @{
	<>
		<link rel="stylesheet" href="/late-default.css" precedence="default" />
		<div class="late">{'LATE' as string}</div>
	</>
}

// A plain hoisted link WITHOUT precedence keeps the per-site head-element
// contract (removed on unmount) — the control for the resource split.
export function PlainLink() @{
	<>
		<link rel="alternate" href="/feed.xml" />
		<div class="plain">{'P' as string}</div>
	</>
}

export function AsyncScript() @{
	<>
		<script async src="/analytics.js" />
		<div class="s">{'S' as string}</div>
	</>
}

export function AsyncScriptDuplicate() @{
	<>
		<script async src="/analytics.js" />
		<div class="s2">{'S2' as string}</div>
	</>
}

// Return-position (React-style `.tsx` value body) forms: resources must
// classify through requiresTemplateNormalization exactly like `@{}` bodies.
export function ReturnScript() {
	return <>
		<script async src="/return-script.js" />
		<div class="rs">{'RS' as string}</div>
	</>;
}

export function ReturnSheet() {
	return <>
		<link rel="stylesheet" href="/return.css" precedence="default" />
		<div class="rl">{'RL' as string}</div>
	</>;
}

// A Float MODULE script — one executable identity with preinitModule.
export function ModuleScript() @{
	<>
		<script async type="module" src="/shared-mod.mjs" />
		<div class="ms">{'MS' as string}</div>
	</>
}

let toggleSheet: ((on: boolean) => void) | null = null;
export function setSheetVisible(on: boolean): void {
	toggleSheet!(on);
}

export function ToggleHost() @{
	const [on, setOn] = useState(true);
	toggleSheet = setOn;
	<section class="toggle">
		@if (on) {
			<SheetA />
		} @else {
			<span class="off">off</span>
		}
	</section>
}
