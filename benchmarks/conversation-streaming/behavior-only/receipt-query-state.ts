import { query$ } from 'octane/signals';
import { authorize, watchBody, watchHistory } from './loaders.ts';

type StreamValue<Stream> = Stream extends AsyncIterable<infer Value> ? Value : never;

// Application-owned cold declarations, shared by SSR and the optional controller.
export const auth$ = query$<string, string>(
	() => 'current-request',
	(_, { signal }) => authorize(signal),
);
export const body$ = query$<string, StreamValue<ReturnType<typeof watchBody>>>(
	() => auth$.get(),
	(_, { signal }) => watchBody(signal),
	{ kind: 'stream' },
);
export const history$ = query$<string, StreamValue<ReturnType<typeof watchHistory>>>(
	() => auth$.get(),
	(_, { signal }) => watchHistory(signal),
	{ kind: 'stream' },
);
