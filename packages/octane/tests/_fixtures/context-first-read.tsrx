import { createContext, memo, use, useState } from 'octane';

const Theme = createContext('light');

let startReading: (() => void) | null = null;
export function readTheme(): void {
	startReading!();
}

// Reads the context only once asked to, so the first read in this module
// happens after the memo boundary above it has already bailed.
function Reader() @{
	const [reading, setReading] = useState(false);
	startReading = () => setReading(true);
	const value = reading ? use(Theme) : 'unread';
	<output>{value as string}</output>
}

function WallImpl() @{
	<Reader />
}
// Its props never change, so every App render takes the memo bail.
const Wall = memo(WallImpl);

export function App(props: { theme: string }) @{
	<Theme value={props.theme}>
		<Wall />
	</Theme>
}
