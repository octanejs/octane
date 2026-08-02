import { useNativeTheme, useWindowState } from '@octanejs/electron';

export function ThemeReader() @{
	const dark = useNativeTheme();
	<span id="theme">
		{dark ? 'dark' : 'light'}
	</span>
}

export function WindowStateReader() @{
	const state = useWindowState();
	<>
		<span id="title">{state.title as string}</span>
		<span id="maximized">
			{state.isMaximized ? 'yes' : 'no'}
		</span>
	</>
}
