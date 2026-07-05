import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// A React-style `.tsx` `return <jsx>` body is VALUE position: the client lowers it
// to `createElement(...)` descriptors, so a component's children are a DESCRIPTOR
// (one hydration block). A `@{}` body is TEMPLATE position: the client uses a
// `__children` render-fn (an extra block). The SERVER must match per form, or the
// server tree is one block deeper than the client and the hydration cursor desyncs
// (the bug that broke the JSX Hacker News example's SSR: a `setSpread … is not a
// function` from a descendant boundary). These assert the compiled children shape.

function clientCode(src: string): string {
	return compile(src, 'f.tsx', {}).code;
}
function serverCode(src: string): string {
	return compile(src, 'f.tsx', { mode: 'server' }).code;
}

describe('.tsx return-form component children — server matches client (descriptors)', () => {
	const RETURN_FORM = `
		export function App({ client, router }) {
			return (
				<Provider client={client}>
					<Inner router={router} />
				</Provider>
			);
		}`;

	it('client lowers return-form children to a createElement descriptor', () => {
		const code = clientCode(RETURN_FORM);
		expect(code).toMatch(/createElement\(\s*Provider/);
		// The child is a nested createElement (descriptor), not a render-fn.
		expect(code).toMatch(/createElement\(\s*Inner/);
	});

	it('server passes return-form children as a createElement DESCRIPTOR (not __schildren)', () => {
		const code = serverCode(RETURN_FORM);
		// children must be a createElement(Inner, …) descriptor — matching the client —
		// so `{props.children}` → ssrChild(descriptor) is ONE block, like childSlot.
		expect(code).toMatch(/"children":\s*\(_\$createElement\(\s*Inner/);
		// It must NOT wrap children in a __schildren render-fn (that adds a block).
		expect(code).not.toMatch(/"children":\s*__schildren/);
	});

	it('`@{}` (template-form) children stay a __schildren render-fn on the server', () => {
		// The same shape authored as a `@{}` body is template position — the client
		// uses componentSlot + a render-fn there, so the server keeps the render-fn too.
		const TEMPLATE_FORM = `
			export function App({ client, router }) @{
				<Provider client={client}>
					<Inner router={router} />
				</Provider>
			}`;
		const code = serverCode(TEMPLATE_FORM);
		expect(code).toMatch(/"children":\s*__schildren/);
	});
});
