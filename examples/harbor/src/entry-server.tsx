// Fizz entry: the server variant of OctaneCompat renders the islands through
// octane's server runtime inside React's stream. server.mjs calls render()
// per request and pipes the stream between the shell prefix and suffix.
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from 'react-dom/server';
import { OctaneCompat } from 'octane/react/server';
import { App } from './App.tsx';

export function render(url: string, options?: RenderToPipeableStreamOptions) {
	return renderToPipeableStream(<App url={url} Compat={OctaneCompat} />, options);
}
