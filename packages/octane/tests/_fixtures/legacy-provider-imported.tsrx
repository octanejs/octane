import { use } from 'octane';
import { Theme } from './legacy-provider-context';

// The types reject `.Provider`; JavaScript, untyped, and `any` callers reach it
// anyway, which is the path the development getter guards.
const UntypedTheme: any = Theme;

function Reader() @{
	<span class="theme">{use(Theme) as string}</span>
}

export function LegacyProvider() @{
	<UntypedTheme.Provider value="dark">
		<Reader />
	</UntypedTheme.Provider>
}

export function CurrentProvider() @{
	<Theme value="dark">
		<Reader />
	</Theme>
}
