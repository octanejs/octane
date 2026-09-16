import { authorizeRequest, authorization, conversation, history } from '../fixture/src/backend.ts';
import { requests } from './context.ts';

async function context(signal: AbortSignal) {
	const request = requests.getStore()!.request;
	return { request, signal, viewer: await authorizeRequest(request) };
}
export async function authorize(signal: AbortSignal) {
	return authorization(await context(signal));
}
export async function* watchBody(signal: AbortSignal) {
	yield* conversation(await context(signal));
}
export async function* watchHistory(signal: AbortSignal) {
	yield* history(await context(signal));
}
