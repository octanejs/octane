/**
 * Differential parity: the SAME `.tsrx` editor fixture runs through
 * @octanejs/lexical (octane) AND the real @lexical/react (React) — the setup
 * rewrites `@octanejs/lexical/X` → `@lexical/react/X` and `octane` → `react`.
 * octane's `mountDifferential` mounts both, and we assert byte-identical
 * innerHTML after mounting and after an identical edit driven on each editor.
 *
 * Both editors are captured via the fixture's `onEditor` prop (octane mounts
 * first, so editors[0] is octane, editors[1] is React). Lexical's core reconciler
 * — shared by both bindings — writes the content DOM, so any divergence is in the
 * octane wrapper (contentEditable element, decorators, context wiring).
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/basic-editor.tsrx');
const LIST_FIXTURE = resolve(__dirname, '../_fixtures/list-editor.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/lexical vs real @lexical/react', () => {
	it('a rich-text editor renders byte-identical DOM on mount and after an edit', async () => {
		const editors: any[] = [];
		const d = await mountDifferential(
			FIXTURE,
			'BasicEditor',
			{ onEditor: (ed: any) => editors.push(ed) },
			CACHE,
		);

		await d.step('mount (empty editor)', () => {});

		await d.step('insert a paragraph of text', () => {
			for (const editor of editors) {
				editor.update(
					() => {
						const root = $getRoot();
						root.clear();
						const paragraph = $createParagraphNode();
						paragraph.append($createTextNode('Hello from octane'));
						root.append(paragraph);
					},
					{ discrete: true },
				);
			}
		});

		d.unmount();
	});

	it('a bullet list renders byte-identical via ListPlugin', async () => {
		const editors: any[] = [];
		const d = await mountDifferential(
			LIST_FIXTURE,
			'ListEditor',
			{ onEditor: (ed: any) => editors.push(ed) },
			CACHE,
		);

		await d.step('mount (empty editor)', () => {});

		await d.step('insert a bullet list', () => {
			for (const editor of editors) {
				editor.update(
					() => {
						const root = $getRoot();
						root.clear();
						const list = $createListNode('bullet');
						const item = $createListItemNode();
						item.append($createTextNode('one'));
						list.append(item);
						root.append(list);
					},
					{ discrete: true },
				);
			}
		});

		d.unmount();
	});
});
