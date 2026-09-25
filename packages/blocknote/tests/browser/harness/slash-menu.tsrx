// Mirrors the "Menus and toolbars" recipe in packages/blocknote/README.md.
import { SuggestionMenu, filterSuggestionItems, getDefaultSlashMenuItems } from '@blocknote/core';
import { useBlockNoteEditor } from '@octanejs/blocknote';
import { useEffect, useSyncExternalStore } from 'octane';

export function SlashMenu() @{
	const editor = useBlockNoteEditor();
	const menu = editor.getExtension(SuggestionMenu)!;

	useEffect(() => {
		menu.addSuggestionMenu({ triggerCharacter: '/' });
		return () => menu.removeSuggestionMenu('/');
	}, [menu]);

	const state = useSyncExternalStore(menu.store.subscribe, () => menu.store.state);
	const items =
		state?.show ? filterSuggestionItems(getDefaultSlashMenuItems(editor), state.query) : [];

	@if (state?.show) {
		<ul
			class="slash-menu"
			style={{ position: 'fixed', left: state.referencePos.left, top: state.referencePos.bottom }}
		>
			@for (const item of items; key item.key) {
				<li
					onMouseDown={(event: MouseEvent) => {
						event.preventDefault(); // keep focus in the editor
						menu.clearQuery();
						menu.closeMenu();
						item.onItemClick();
					}}
				>{item.title}</li>
			}
		</ul>
	}
}
