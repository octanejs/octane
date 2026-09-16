import { derived$, query$, signal$ } from 'octane/signals';
import { authorize, watchBody, watchHistory } from './loaders.ts';

type StreamValue<Stream> = Stream extends AsyncIterable<infer Value> ? Value : never;

// The public compiler gives these plain-module descriptors identical server/client keys.
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
export const draft$ = signal$('');
export const draftLength$ = derived$(() => String(draft$.get().length));
export const selectedDay$ = signal$(0);
