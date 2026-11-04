// @vitest-environment jsdom
import { collectDiagnostics } from 'octane/compiler';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { mount } from '../../octane/tests/_helpers.js';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { strengthen, transformModule } from '../dist/index.js';

it('preserves children inspected by a local helper before rendering', () => {
	const source = `import { Children as Nodes, isValidElement, type ReactNode } from 'react';
function allBadges(value: ReactNode) {
	const elements = Nodes.toArray(value).filter(isValidElement<{ className?: string }>);
	return elements.length > 0 && elements.every(element => element.props.className === 'badge');
}
const hasBadges = (label: string, children: ReactNode) => label === 'all' && allBadges(children);
function Group({ children }: { children?: ReactNode }) {
	return <section data-matches={String(hasBadges('all', children))}>{children}</section>;
}
export function Example({ kind }: { kind: string }) {
	const badge = <b className="badge">b</b>;
	if (kind === 'prebuilt') return <Group>{badge}</Group>;
	if (kind === 'explicit') return <Group children={<i className="badge" />} />;
	return <Group>{kind === 'none' ? null : <b className="badge">a</b>}{kind === 'mixed' ? <i>b</i> : 'text'}</Group>;
}`;
	const file = 'badges.tsrx';
	const { code } = transformModule(source, 'badges.tsx');
	const server = loadCompiledFixtureSource(code, { id: file, mode: 'server' });
	const client = loadCompiledFixtureSource(code, { id: file, mode: 'client' });
	const view = mount(client.Example, { kind: 'none' });
	try {
		for (const [kind, matches] of [
			['badges', 'true'],
			['mixed', 'false'],
			['none', 'false'],
			['prebuilt', 'true'],
			['explicit', 'true'],
			['badges', 'true'],
		]) {
			view.update(client.Example, { kind });
			expect(view.find('section').getAttribute('data-matches')).toBe(matches);
			expect(renderToStaticMarkup(server.Example, { kind }).html).toContain(
				`data-matches="${matches}"`,
			);
		}
	} finally {
		view.unmount();
	}
	const { code: requested } = transformModule(source, 'badges.tsx', { strong: true });
	const result = strengthen({ collectDiagnostics, from: 'octane/compiler' }, requested, file);
	expect(result.strong).toBe(false);
	expect(result.code).toBe(code);
	expect(result.blockers.map((b) => b.code)).toContain('OCTANE_STRONG_ELEMENT_API');
});

it('marks only callers of the inspected binding and argument', () => {
	const source = `import { Children } from 'react';
function count(label, nodes) { return Children.count(nodes); }
function Untouched({ children }) {
	function count(label, nodes) { return nodes; }
	return <p>{count('', children)}</p>;
}
function Label({ children }) { return <p>{count(children, [])}</p>; }`;
	expect(transformModule(source, 'count.jsx').code).not.toContain('descriptorChildren');
});
