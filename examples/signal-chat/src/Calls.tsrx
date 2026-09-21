import type { AnswerInput, LabConfig } from './types.ts';

module server {
	import type { ServerCallContext } from 'octane/server';
	import { answer, history, session, tools } from './backend.ts';

	export function openSession(context: ServerCallContext) {
		return session(context);
	}

	export function watchAnswer(input: AnswerInput, context: ServerCallContext) {
		return answer(input, context);
	}

	export function watchHistory(config: LabConfig, context: ServerCallContext) {
		return history(config, context);
	}

	export function watchTools(config: LabConfig, context: ServerCallContext) {
		return tools(config, context);
	}
}

import { openSession, watchAnswer, watchHistory, watchTools } from 'server';

export { openSession, watchAnswer, watchHistory, watchTools };
