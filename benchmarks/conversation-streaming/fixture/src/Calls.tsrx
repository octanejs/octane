module server {
	import type { ServerCallContext } from 'octane/server';
	import { authorization, conversation, history } from './backend.ts';

	export function authorize(context: ServerCallContext) {
		return authorization(context);
	}

	export function watchBody(context: ServerCallContext) {
		return conversation(context);
	}

	export function watchHistory(context: ServerCallContext) {
		return history(context);
	}
}

import { authorize, watchBody, watchHistory } from 'server';

export { authorize, watchBody, watchHistory };
