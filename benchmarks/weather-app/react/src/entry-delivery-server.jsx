import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import App from './App.jsx';

export function renderApp(options) {
	return renderToPipeableStream(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
		options,
	);
}
