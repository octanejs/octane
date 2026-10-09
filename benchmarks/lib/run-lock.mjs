import {
	closeSync,
	fstatSync,
	lstatSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

// All worktrees for this user share a lock: competing benchmark processes
// introduce CPU and memory contention even when their output paths differ.
export function acquireBenchmarkLock(
	lockPath = join(tmpdir(), `octane-benchmark-${userInfo().uid}.lock`),
) {
	let fd;
	try {
		fd = openSync(lockPath, 'wx', 0o600);
	} catch (error) {
		if (error.code !== 'EEXIST') throw error;
		let owner = '';
		try {
			const { pid, cwd } = JSON.parse(readFileSync(lockPath, 'utf8'));
			if (Number.isInteger(pid) && typeof cwd === 'string') owner = ` (PID ${pid}, ${cwd})`;
		} catch {
			// An unreadable or partially written lock still blocks a competing run.
		}
		throw new Error(
			`An Octane benchmark lock already exists${owner}: ${lockPath}. ` +
				'Wait for that run to finish. If it exited without cleanup, verify that no benchmark is running before removing this lock.',
		);
	}
	const acquired = fstatSync(fd);
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		try {
			const current = lstatSync(lockPath);
			// A manually replaced lock belongs to another run. Keep the acquired
			// descriptor open until this check so its inode cannot be reused.
			if (current.dev === acquired.dev && current.ino === acquired.ino) unlinkSync(lockPath);
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		} finally {
			closeSync(fd);
		}
	};
	try {
		writeFileSync(fd, JSON.stringify({ pid: process.pid, cwd: process.cwd() }) + '\n');
	} catch (error) {
		release();
		throw error;
	}
	return release;
}
