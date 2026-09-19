import { derived$, query$, signal$ } from 'octane/signals';
import { authorize, watchBody, watchHistory } from './Calls.tsrx';

type Authorization = Awaited<ReturnType<typeof authorize>>;
type StreamValue<Stream> = Awaited<Stream> extends AsyncIterable<infer Value> ? Value : never;

// These are implicit-owner descriptors, not process-global mutable data.
export const auth$ = query$<string, Authorization>(
	() => 'current-request',
	(_, { signal }) => authorize({ signal }),
);
export const body$ = query$<Authorization, StreamValue<ReturnType<typeof watchBody>>>(
	() => auth$.get(),
	(_, { signal }) => watchBody({ signal }),
	{ kind: 'stream' },
);
export const history$ = query$<Authorization, StreamValue<ReturnType<typeof watchHistory>>>(
	() => auth$.get(),
	(_, { signal }) => watchHistory({ signal }),
	{ kind: 'stream' },
);
export const draft$ = signal$('');
export const draftLength$ = derived$(() => String(draft$.get().length));
export const checkedDraft$ = signal$('');
export const selectedTurn$ = signal$('none');
export const selectedHistory$ = signal$('none');
