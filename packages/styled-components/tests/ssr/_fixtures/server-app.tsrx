import styled, { ThemeProvider, createGlobalStyle, keyframes } from '@octanejs/styled-components';

const pulse = keyframes`
  50% { opacity: 0.5; }
`;

const Global = createGlobalStyle`
  body { margin: 0; }
`;

const Hero = styled.h1`
  color: ${(p: any) => p.theme.fg};
  animation: ${pulse} 2s infinite;
`;

const Plain = styled.p`
  padding: 4px;
`;

export function ServerApp() @{
	<div>
		<Global />
		<ThemeProvider theme={{ fg: 'tomato' }}>
			<Hero id="hero">Server</Hero>
		</ThemeProvider>
		<Plain id="plain">text</Plain>
	</div>
}
