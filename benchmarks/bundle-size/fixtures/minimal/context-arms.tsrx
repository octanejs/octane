import { createContext, createRoot, useContext, useState } from 'octane';

// A provider in each kind of directive arm stays on the compiled provider path,
// as one directly in the template does.
const ThemeContext = createContext('light');

function ContextReader() @{
	const value = useContext(ThemeContext);
	<span class="minimal-context-arms-value">{value as string}</span>
}

function ContextArmsRoot() @{
	const [theme, setTheme] = useState('light');
	<div>
		<button id="minimal-context-arms-action" onClick={() => setTheme('dark')}>
			{'change'}
		</button>
		@if (theme !== '') {
			<ThemeContext value={theme}>
				<ContextReader />
			</ThemeContext>
		}
		@for (const item of [theme]; key item) {
			<ThemeContext value={item}>
				<ContextReader />
			</ThemeContext>
		}
		@switch (theme) {
			@default: {
				<ThemeContext value={theme}>
					<ContextReader />
				</ThemeContext>
			}
		}
		@try {
			<ThemeContext value={theme}>
				<ContextReader />
			</ThemeContext>
		} @catch (error) {
			<p>{'failed'}</p>
		}
	</div>
}

function read(container: HTMLElement) {
	return Array.from(
		container.querySelectorAll('.minimal-context-arms-value'),
		(node) => node.textContent,
	).join(',');
}

export async function run(container: HTMLElement) {
	const root = createRoot(container);
	root.render(ContextArmsRoot);
	const before = read(container);
	(container.querySelector('#minimal-context-arms-action') as HTMLButtonElement).click();
	await Promise.resolve();
	const after = read(container);
	root.unmount();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
