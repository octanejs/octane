import { StyleSheetConsumer, ThemeConsumer, ThemeProvider } from '@octanejs/styled-components';

// Element children compile to children-block functions — the Consumers must
// NOT invoke them as render props (they expect a plain function child).
export function ConsumerWithElementChildren() @{
	<div id="host">
		<ThemeProvider theme={{ fg: 'black' }}>
			<StyleSheetConsumer>
				<span id="sheet-child">nope</span>
			</StyleSheetConsumer>
			<ThemeConsumer>
				<span id="theme-child">nope</span>
			</ThemeConsumer>
		</ThemeProvider>
	</div>
}
