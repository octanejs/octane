import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DREI_PARITY_CHECKER = 'packages/drei/scripts/check-react-parity.mjs';
export const GENERIC_CHECK = 'scripts/react-parity/check.mjs';

export function verifyDreiReactParity(root) {
	const checker = resolve(root, DREI_PARITY_CHECKER);
	const result = spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		const detail = (result.stderr || result.stdout || 'drei parity checker failed').trim();
		throw new Error(detail);
	}
	return { ok: true };
}

export function assertDreiParityWiredIntoGenericCheck(root) {
	const source = readFileSync(resolve(root, GENERIC_CHECK), 'utf8');
	if (!source.includes('verifyDreiReactParity')) {
		throw new Error(
			'generic react-parity check must invoke verifyDreiReactParity; omitting it leaves drei negative controls unenforced',
		);
	}
	if (!source.includes('drei-parity-lib.mjs')) {
		throw new Error(
			'generic react-parity check must import scripts/react-parity/drei-parity-lib.mjs',
		);
	}
	if (!source.includes('verifyDreiTypes')) {
		throw new Error(
			'generic react-parity check must invoke verifyDreiTypes; omitting it leaves type-group controls unenforced',
		);
	}
}
