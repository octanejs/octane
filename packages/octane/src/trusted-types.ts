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
//   (FRAMEWORK_POLICY). Application strings never do, so the policy cannot
//   launder them. A page that allowlists policies adds `octane` to
//   `trusted-types`.

/**
 * The `octane` policy where the browser supports Trusted Types, else null. It is
 * created at module load and its rule is the native `String`, so a template
 * parse runs no extra script function. A refused policy (a `trusted-types` list
 * without `octane`, or a second Octane copy without `'allow-duplicates'`) is
 * null too, so the sink reports the violation rather than module load.
 * Callers write `FRAMEWORK_POLICY ? FRAMEWORK_POLICY.createHTML(html) : html`.
 */
export const FRAMEWORK_POLICY: { createHTML(html: string): string } | null =
	/* @__PURE__ */ (() => {
		const tt = (globalThis as any).trustedTypes;
		try {
			return tt ? tt.createPolicy('octane', { createHTML: String }) : null;
		} catch {
			return null;
		}
	})();

/**
 * The value to write for the object `value`, whose coerced, sanitized string
 * is `text`: `value` itself when it is a TrustedHTML, TrustedScript, or
 * TrustedScriptURL that `text` did not replace, else `text`. Callers test
 * `typeof value === 'object'` first, so primitive writes make no call.
 */
export function trustedOr(value: object | null, text: string): string {
	const tt = (globalThis as any).trustedTypes;
	return value !== null &&
		tt &&
		(tt.isHTML(value) || tt.isScriptURL(value) || tt.isScript(value)) &&
		text === String(value)
		? (value as unknown as string)
		: text;
}
