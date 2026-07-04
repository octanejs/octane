import { TEXTS } from './escape-data';

// escape-heavy fixture — 10,000 text holes whose every value contains all of
// & < > " ' (text-position escaping rewrites only & < >; the quotes ride along
// as realistic prose). Isolates runtime.server.ts escapeHtml (the multi-pass
// `String(v).replace(/&/…).replace(/</…).replace(/>/…)` chain): the per-item
// markup around each hole is minimal and constant, so nearly all the render
// time is text-hole serialization. A regression here points at escapeHtml (or
// at ssrText's null/false guard) — not at the reconciler or the compiler.
export function EscapeApp() @{
	<ul class="esc">
		@for (const t of TEXTS; key t.id) {
			<li class="e">
				{t.text as string}
			</li>
		}
	</ul>
}
