import { createContext, createRoot, useContext, useState } from 'octane';

const ThemeContext = createContext('light');

function ContextReader() @{
	const value = useContext(ThemeContext);
	<span id="minimal-context-value">{value as string}</span>
}

function ContextRoot() @{
	const [theme, setTheme] = useState('light');
	<div>
		<button id="minimal-context-action" onClick={() => setTheme('dark')}>{'change'}</button>
		<ThemeContext.Provider value={theme}>
			<ContextReader />
		</ThemeContext.Provider>
	</div>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(ContextRoot);
	const before = container.querySelector('#minimal-context-value')!.textContent;
	(container.querySelector('#minimal-context-action') as HTMLButtonElement).click();
	await Promise.resolve();
	const after = container.querySelector('#minimal-context-value')!.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
