import type { ChannelId, HistoryPage, Message, ThreadData } from './types';

async function jsonRequest<Result>(url: string, init?: RequestInit): Promise<Result> {
	const response = await fetch(url, init);
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(detail || `Relay request failed with ${response.status}`);
	}
	return (await response.json()) as Result;
}

export function loadHistory(
	session: string,
	channel: ChannelId,
	options: { before?: string; failOnce?: boolean } = {},
): Promise<HistoryPage> {
	const params = new URLSearchParams({ session, channel });
	if (options.before) params.set('before', options.before);
	if (options.failOnce) params.set('fault', 'once');
	return jsonRequest<HistoryPage | { error: string }>(`/api/history?${params}`).then((result) => {
		if ('error' in result) throw new Error(result.error);
		return result;
	});
}

export function loadThread(messageId: string): Promise<ThreadData> {
	return jsonRequest<ThreadData>(`/api/thread?message=${encodeURIComponent(messageId)}`);
}

export function publishMessage(
	session: string,
	channel: ChannelId,
	body: string,
	clientRequestId: string,
): Promise<{ accepted: true; id: string }> {
	return jsonRequest('/api/messages', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ session, channel, body, clientRequestId }),
	});
}

export function requestTeammateUpdate(
	session: string,
	channel: ChannelId,
): Promise<{ accepted: true; id: string }> {
	return jsonRequest('/api/demo', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ session, channel }),
	});
}

export interface RelaySubscription {
	close(): void;
}

export function subscribe(
	session: string,
	channel: ChannelId,
	since: number,
	callbacks: {
		onOpen: () => void;
		onReconnect: () => void;
		onMessage: (message: Message, sequence: number) => void;
	},
): RelaySubscription {
	const params = new URLSearchParams({ session, channel, since: String(since) });
	const source = new EventSource(`/api/stream?${params}`);
	source.addEventListener('open', callbacks.onOpen);
	source.addEventListener('error', callbacks.onReconnect);
	source.addEventListener('message', (event) => {
		const payload = JSON.parse(event.data) as { message: Message; sequence: number };
		callbacks.onMessage(payload.message, payload.sequence);
	});
	return { close: () => source.close() };
}
