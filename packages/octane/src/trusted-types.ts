// Trusted Types
//
// Under `require-trusted-types-for 'script'` a string written to an HTML, script,
// or script-URL sink throws. Two rules keep Octane working there:
//
// - A Trusted Types value the application passes (`dangerouslySetInnerHTML`, an
//   attribute such as `srcdoc` or a script's `src`) reaches its sink as the
//   object itself, never its string (trustedOr), as in React 19.3.
// - Markup Octane itself produces (compiled templates, binding fragments,
//   streamed regions) goes through one module-private policy named `octane`
//   (frameworkHTML). Application strings never do, so the policy cannot launder
//   them. A page that allowlists policies adds `octane` to `trusted-types`.

let POLICY: { createHTML(html: string): unknown } | null | undefined;

/**
 * Framework-produced `html` as the page's sink accepts it: TrustedHTML from the
 * `octane` policy where the browser supports Trusted Types, else the string.
 * A refused policy (a `trusted-types` list without `octane`, or a second Octane
 * copy without `'allow-duplicates'`) falls back to the string, so the sink
 * reports the violation rather than this call.
 */
export function frameworkHTML(html: string): string {
	if (POLICY === undefined) {
		const tt = (globalThis as any).trustedTypes;
		try {
			POLICY = tt ? tt.createPolicy('octane', { createHTML: (s: string) => s }) : null;
		} catch {
			POLICY = null;
		}
	}
	return POLICY === null ? html : (POLICY!.createHTML(html) as string);
}

/**
 * The value to write for `value`, whose coerced, sanitized string is `text`:
 * `value` itself when it is a TrustedHTML, TrustedScript, or TrustedScriptURL
 * that `text` did not replace, else `text`.
 */
export function trustedOr(value: unknown, text: string): string {
	if (typeof value !== 'object' || value === null) return text;
	const tt = (globalThis as any).trustedTypes;
	return tt &&
		(tt.isHTML(value) || tt.isScriptURL(value) || tt.isScript(value)) &&
		text === String(value)
		? (value as unknown as string)
		: text;
}
