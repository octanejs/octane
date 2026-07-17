import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LifecycleEditor } from '../_fixtures/lifecycle-editor.tsrx';
import { flushEffects, mount } from '../_helpers';

function settle(): void {
	flushEffects();
	flushSync(() => {});
	flushEffects();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/tiptap useEditor', () => {
	it('uses current callbacks, replaces changed dependencies, and destroys on unmount', () => {
		vi.useFakeTimers();
		const editors: any[] = [];
		const mounts: string[] = [];
		const unmounts: string[] = [];
		const destroys: string[] = [];
		const updates: Array<[string, string]> = [];
		const callbacks = {
			onEditor: (editor: any) => editors.push(editor),
			onMount: (label: string) => mounts.push(label),
			onUnmount: (label: string) => unmounts.push(label),
			onDestroy: (label: string) => destroys.push(label),
			onUpdate: (label: string, text: string) => updates.push([label, text]),
		};

		const result = mount(LifecycleEditor as any, {
			...callbacks,
			dependency: 'first',
			label: 'initial',
		});
		settle();
		const initialEditor = editors.at(-1);
		expect(initialEditor).toBeTruthy();
		expect(result.find('[data-editor-status]').getAttribute('data-editor-status')).toBe('ready');

		result.update(LifecycleEditor as any, {
			...callbacks,
			dependency: 'first',
			label: 'current',
		});
		settle();
		expect(editors.at(-1)).toBe(initialEditor);

		initialEditor.commands.setContent('<p>Updated content</p>');
		settle();
		expect(updates.at(-1)).toEqual(['current', 'Updated content']);

		initialEditor.unmount();
		expect(unmounts.at(-1)).toBe('current');
		initialEditor.mount(document.createElement('div'));
		expect(mounts.at(-1)).toBe('current');

		result.update(LifecycleEditor as any, {
			...callbacks,
			dependency: 'second',
			label: 'replacement',
		});
		settle();
		const replacementEditor = editors.at(-1);
		expect(replacementEditor).not.toBe(initialEditor);
		expect(initialEditor.isDestroyed).toBe(true);
		expect(replacementEditor.getText()).toBe('Lifecycle');

		result.unmount();
		flushEffects();
		vi.runAllTimers();
		expect(replacementEditor.isDestroyed).toBe(true);
		expect(destroys.at(-1)).toBe('replacement');
	});
});
