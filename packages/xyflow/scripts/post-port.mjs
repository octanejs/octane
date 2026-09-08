#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../src');

const JSX_GENERIC_REPLACEMENTS = [
	['<StoreUpdater<NodeType, EdgeType>', '<StoreUpdater'],
	['<GraphView<NodeType, EdgeType>', '<GraphView'],
	['<SelectionListener<NodeType, EdgeType>', '<SelectionListener'],
	['<FlowRenderer<NodeType>', '<FlowRenderer'],
	['<EdgeRenderer<EdgeType>', '<EdgeRenderer'],
	['<ConnectionLineWrapper<NodeType>', '<ConnectionLineWrapper'],
	['<NodeRenderer<NodeType>', '<NodeRenderer'],
	['<NodeWrapper<NodeType>', '<NodeWrapper'],
	['<EdgeWrapper<EdgeType>', '<EdgeWrapper'],
	['<ConnectionLine<NodeType>', '<ConnectionLine'],
	['<EdgeUpdateAnchors<EdgeType>', '<EdgeUpdateAnchors'],
	['<SelectionListenerInner<NodeType, EdgeType>', '<SelectionListenerInner'],
	['<MiniMapNodes<NodeType>', '<MiniMapNodes'],
	['<NodeComponentWrapper<NodeType>', '<NodeComponentWrapper'],
];

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

function patchFixedForwardRef(source) {
	return source.replace(
		/export function fixedForwardRef[\s\S]*?\n\}/,
		`export function fixedForwardRef<T, P extends Record<string, unknown> = Record<string, unknown>>(
  render: (props: P, ref: Octane.Ref<T>) => Octane.JSX.Element,
): (props: P & { ref?: Octane.Ref<T> }) => Octane.JSX.Element {
  function Forwarded(props: P & { ref?: Octane.Ref<T> }) {
    const { ref, ...rest } = props;
    return render(rest as P, ref as Octane.Ref<T>);
  }
  return Forwarded;
}`,
	);
}

for (const file of walk(ROOT)) {
	if (!file.endsWith('.ts') && !file.endsWith('.tsrx')) continue;
	let source = readFileSync(file, 'utf8');
	source = source.replace(/from 'zustand\/shallow'/g, "from '@octanejs/zustand/shallow'");
	if (file.endsWith('utils/general.ts')) {
		source = source.replace(
			/import \{ type Ref, type RefAttributes, forwardRef, JSX, PropsWithoutRef \} from 'octane';/,
			"import type { Octane } from 'octane/jsx-runtime';",
		);
		source = patchFixedForwardRef(source);
	}
	if (file.endsWith('.tsrx')) {
		for (const [from, to] of JSX_GENERIC_REPLACEMENTS) {
			source = source.split(from).join(to);
		}
	}
	writeFileSync(file, source);
}

console.log('Post-port patches applied');
