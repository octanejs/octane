/** @jsxImportSource octane */
import { use } from 'octane';
import { Theme } from './legacy-provider-context';

// The types reject `.Provider`; JavaScript, untyped, and `any` callers reach it
// anyway, which is the path the development getter guards.
const UntypedTheme: any = Theme;

function Reader() {
	return <span className="theme">{use(Theme)}</span>;
}

export function LegacyProvider() {
	return (
		<UntypedTheme.Provider value="dark">
			<Reader />
		</UntypedTheme.Provider>
	);
}

export function CurrentProvider() {
	return (
		<Theme value="dark">
			<Reader />
		</Theme>
	);
}
