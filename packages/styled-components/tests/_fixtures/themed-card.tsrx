import { useState } from 'octane';
import styled, { ThemeProvider } from '@octanejs/styled-components';

const Card = styled.div`
  color: ${(p: any) => p.theme.fg};
  background: ${(p: any) =>
	p.theme.bg};
  border-color: ${(p: any) => p.theme.accent};
`;

export function ThemedCard() @{
	const [dark, setDark] = useState(false);
	<div>
		<ThemeProvider theme={{ fg: dark ? 'white' : 'black', bg: dark ? 'black' : 'white' }}>
			<ThemeProvider theme={(outer: any) => ({ ...outer, accent: 'rebeccapurple' })}>
				<Card id="card">content</Card>
			</ThemeProvider>
		</ThemeProvider>
		<button id="toggle-theme" onClick={() => setDark((d) => !d)}>
			toggle
		</button>
	</div>
}
