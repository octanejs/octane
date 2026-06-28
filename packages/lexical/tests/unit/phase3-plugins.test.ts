import { describe, it, expect } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { ListEditor } from '../_fixtures/list-editor.tsrx';
import { EmptyProbeEditor } from '../_fixtures/empty-probe.tsrx';
import { HrEditor } from '../_fixtures/hr-editor.tsrx';
import { $createHorizontalRuleNode } from '@octanejs/lexical/LexicalHorizontalRuleNode';

describe('@octanejs/lexical — Phase 3 plugins + hooks', () => {
	it('ListPlugin: a list renders as <ul><li>', () => {
		let editor: any;
		const r = mount(ListEditor as any, { onEditor: (ed: any) => (editor = ed) });
		flushEffects();
		const ce = r.find('[contenteditable="true"]') as HTMLElement;

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
		flushEffects();

		expect(ce.querySelector('ul')).toBeTruthy();
		expect(ce.querySelector('ul li')).toBeTruthy();
		expect(ce.textContent).toBe('one');
		r.unmount();
	});

	it('useLexicalIsTextContentEmpty: tracks emptiness across edits', async () => {
		let editor: any;
		let isEmpty: boolean | undefined;
		const r = mount(EmptyProbeEditor as any, {
			onState: (ed: any, empty: boolean) => {
				editor = ed;
				isEmpty = empty;
			},
		});
		flushEffects();
		expect(isEmpty).toBe(true);

		editor.update(
			() => {
				const root = $getRoot();
				root.clear();
				const paragraph = $createParagraphNode();
				paragraph.append($createTextNode('x'));
				root.append(paragraph);
			},
			{ discrete: true },
		);
		// The hook's listener calls setState; drain octane's re-render.
		flushEffects();
		await nextPaint();
		flushEffects();
		expect(isEmpty).toBe(false);
		r.unmount();
	});

	it('HorizontalRuleNode: the decorator node renders <hr> through the decorator portal', () => {
		let editor: any;
		const r = mount(HrEditor as any, { onEditor: (ed: any) => (editor = ed) });
		flushEffects();
		const ce = r.find('[contenteditable="true"]') as HTMLElement;

		editor.update(
			() => {
				$getRoot().append($createHorizontalRuleNode());
			},
			{ discrete: true },
		);
		flushEffects();

		// The node rendered its <hr>, and decorate() registered a decorator (which the
		// Decorators portal renders the HorizontalRuleComponent into).
		expect(ce.querySelector('hr')).toBeTruthy();
		expect(Object.keys(editor.getDecorators()).length).toBeGreaterThan(0);
		r.unmount();
	});
});
