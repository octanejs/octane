import { useHotkey } from '@tanstack/react-hotkeys';
import { useNavigate } from '@tanstack/react-router';

export function HotkeysShortcutBinding() {
	const navigate = useNavigate();

	useHotkey('Mod+Enter', () => {
		navigate({
			to: '/$libraryId/$version/docs',
			params: { libraryId: 'hotkeys', version: 'latest' },
		});
	});

	return null;
}
