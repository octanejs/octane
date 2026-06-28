import { describe, it, expect } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { mount, flushEffects } from '../_helpers';
import { BasicEditor } from '../_fixtures/basic-editor.tsrx';

// Phase 2 MVP gate: a rich-text editor built from the ported components mounts on
// octane, binds the LexicalEditor to its contentEditable via the ref→setRootElement
// path, and renders content that Lexical's core reconciler writes into that node.
describe('@octanejs/lexical — rich text editor (MVP gate)', () => {
	it('mounts, binds the editor to the contentEditable, and renders typed content', () => {
		let editor: any;
		const r = mount(BasicEditor as any, { onEditor: (ed: any) => (editor = ed) });
		flushEffects();

		// Composer created the editor; Capture handed it back.
		expect(editor).toBeTruthy();

		// ContentEditableElement rendered the editable surface…
		const ce = r.find('[contenteditable="true"]') as HTMLElement;
		expect(ce.getAttribute('role')).toBe('textbox');
		expect(ce.getAttribute('spellcheck')).toBe('true');

		// …and the ref callback bound the editor to THIS exact DOM node (the crux:
		// octane's commit-phase callback ref fired with a connected element).
		expect(editor.getRootElement()).toBe(ce);

		// Drive the editor via its API; Lexical core reconciles into the bound node.
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
		flushEffects();

		expect(ce.textContent).toBe('Hello from octane');
		const p = ce.querySelector('p');
		expect(p).toBeTruthy();
		expect(p!.querySelector('span')).toBeTruthy();

		r.unmount();
	});
});
