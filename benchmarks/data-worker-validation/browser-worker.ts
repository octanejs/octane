/** The data worker as a Chromium dedicated worker. See owner.ts. */
import { startOwner, type Control } from './owner.ts';

const scope = globalThis as unknown as {
	location: { search: string };
	onmessage: ((event: { data: Control }) => void) | null;
	postMessage(message: unknown): void;
};
const search = new URLSearchParams(scope.location.search);
const handle = startOwner(Number(search.get('count')), search.get('validate') === '1');
scope.onmessage = ({ data }) => {
	const answer = handle(data);
	if (answer) scope.postMessage(answer);
};
