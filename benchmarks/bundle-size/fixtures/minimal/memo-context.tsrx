import { createContext, createRoot, memo, useContext, useState } from 'octane';

const ThemeContext = createContext('light');

function ContextValue() @{
	const value = useContext(ThemeContext);
	<span id="minimal-memo-context-value">{value as string}</span>
}

// A memo wall: its props never change, so only the recorded context read lets
// the provider's update re-render it.
const ContextReader = memo(ContextValue);

function ContextRoot() @{
	const [theme, setTheme] = useState('light');
	<div>
		<button id="minimal-memo-context-action" onClick={() => setTheme('dark')}>
			{'change'}
		</button>
		<ThemeContext value={theme}>
			<ContextReader />
		</ThemeContext>
	</div>
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(ContextRoot);
	const before = container.querySelector('#minimal-memo-context-value')!.textContent;
	(container.querySelector('#minimal-memo-context-action') as HTMLButtonElement).click();
	await Promise.resolve();
	const after = container.querySelector('#minimal-memo-context-value')!.textContent;
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
