import { describe, expect, it } from 'vitest';
import { loadCompiledFixtureSource } from './_server-fixture';
import { createRoot, flushSync } from '../src/index.js';

// A Provider whose children flip between a compiled children block and a
// descriptor remounts them (#2043). Over committed DOM the outgoing children
// leave at commit and the incoming ones build off-document: the render that
// flips writes none of the page.
const SOURCE = `
import { createContext, createElement, useContext } from 'octane';
const Ctx = createContext('none');
function Reader() @{
	<span class="val">{useContext(Ctx) as string}</span>
}
function Probe(props) @{
	props.probe();
	<></>
}
function Passthrough(props) {
	return props.children ?? null;
}
function DialectRoot(props) {
	return createElement(Ctx, {
		value: props.value,
		children: props.wrapped ? createElement(Passthrough, { children: props.children }) : props.children,
	});
}
export function App(props) @{
	<div>
		<span class="before">{'before'}</span>
		<DialectRoot wrapped={props.wrapped} value="ctx">
			<Reader />
		</DialectRoot>
		<span class="after">{'after'}</span>
		<Probe probe={props.probe} />
	</div>
}
`;

describe.each([false, true])('a Provider children dialect flip (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: `provider-dialect-off-document-${dev}.tsrx`,
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	it.each([
		['a children block to a descriptor', false],
		['a descriptor to a children block', true],
	])('writes nothing during the render that flips %s', (_name, from) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		const during: MutationRecord[][] = [];
		let armed = false;
		const probe = () => {
			if (armed) during.push(observer.takeRecords());
		};
		try {
			flushSync(() => root.render(client.App, { wrapped: from, probe }));
			const before = container.querySelector('.before');
			const after = container.querySelector('.after');
			observer.observe(container, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
			});
			armed = true;
			flushSync(() => root.render(client.App, { wrapped: !from, probe }));
			expect(during.length).toBeGreaterThan(0);
			for (const records of during) expect(records).toEqual([]);
			expect(container.querySelectorAll('.val')).toHaveLength(1);
			expect(container.querySelector('.val')!.textContent).toBe('ctx');
			expect(container.querySelector('.before')).toBe(before);
			expect(container.querySelector('.after')).toBe(after);
			expect(container.textContent).toBe('beforectxafter');
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});
});
