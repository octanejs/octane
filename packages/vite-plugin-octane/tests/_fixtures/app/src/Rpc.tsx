module server {
	export async function fixtureTsxRpc(value: string) {
		return 'tsx-rpc:' + value;
	}
}

import { fixtureTsxRpc } from 'server';

export function RpcProbe() {
	return <button onClick={() => fixtureTsxRpc('browser')}>Call TSX server</button>;
}
