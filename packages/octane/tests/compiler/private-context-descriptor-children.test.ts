import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';

// A provider whose children reach it as element descriptors needs the public
// Context's descriptor dialect, so the production client compile must keep the
// authored `createContext` factory that development compiles keep.
const prelude = `import {createContext,descriptorChildren,useContext} from 'octane';
const Message=createContext('default');
function Value() @{ <span>{useContext(Message) as string}</span> }
`;
const provider = '<Message value="updated"><Value /></Message>';
const sources: Record<string, string> = {
	'a descriptorChildren child': `const Frame=descriptorChildren(FrameBody);
function FrameBody(props) @{ <div>{props.children}</div> }
export function App() @{ <Frame>${provider}</Frame> }`,
	'a ReactCompat child': `import {ReactCompat} from 'octane/react';
export function App() @{ <ReactCompat>${provider}</ReactCompat> }`,
	'a bundler-proven descriptorChildren import': `import {Frame} from './frame.tsrx';
export function App() @{ <Frame>${provider}</Frame> }`,
	'a directly called @{} function': `function Helper() @{ ${provider} }
export function App() @{ <div>{Helper()}</div> }`,
};
const isDescriptorChildrenImport = (request: string, imported: string) =>
	request === './frame.tsrx' && imported === 'Frame';

/** The module and export the compiled `Message` binding is created from. */
function contextFactory(source: string, dev: boolean) {
	const { inspect } = compile(source, 'descriptor-provider.tsrx', {
		dev,
		hmr: false,
		mode: 'client',
		inspect: true,
		isDescriptorChildrenImport,
	} as any);
	const imports = new Map<string, string>();
	let factory: string | undefined;
	for (const node of inspect.ast.body) {
		if (node.type === 'ImportDeclaration') {
			for (const specifier of node.specifiers)
				imports.set(specifier.local.name, `${node.source.value}#${specifier.imported?.name}`);
		} else if (node.type === 'VariableDeclaration') {
			for (const declarator of node.declarations)
				if (declarator.id.name === 'Message') factory = declarator.init.callee.name;
		}
	}
	return factory === undefined ? undefined : imports.get(factory);
}

describe('module-private Contexts with descriptor children', () => {
	it.each(Object.entries(sources))(
		'keeps the public factory for a provider in %s in both modes',
		(_, app) => {
			const source = prelude + app;
			expect(contextFactory(source, true)).toBe('octane#createContext');
			expect(contextFactory(source, false)).toBe('octane#createContext');
		},
	);
});
