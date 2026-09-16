import { appendFileSync, readdirSync, readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';

export function diagnosticUrl(value) {
	try {
		const url = new URL(value);
		return /^(https?|wss?):$/.test(url.protocol)
			? `${url.protocol}//${url.host}${url.pathname}`
			: `${url.protocol}[redacted]`;
	} catch {
		return '[invalid URL]';
	}
}

export function diagnosticError(error) {
	return String(error?.message ?? error)
		.replace(/(?:https?|wss?):\/\/[^\s"'<>]+/g, diagnosticUrl)
		.slice(0, 2000);
}

// Diagnostic I/O must never change a test outcome, including during teardown.
export function createDiagnosticWriter(file) {
	let warned = false;
	return (event, details = {}) => {
		try {
			appendFileSync(file, `${JSON.stringify({ time: Date.now(), event, ...details })}\n`);
		} catch (error) {
			if (!warned) console.error(`Browser diagnostics unavailable: ${diagnosticError(error)}`);
			warned = true;
		}
	};
}

export function collectBrowserResources(proc = '/proc', diskPath = '/tmp') {
	const result = { processes: [], unavailable: [] };
	try {
		result.memory = Object.fromEntries(
			readFileSync(join(proc, 'meminfo'), 'utf8')
				.split('\n')
				.flatMap((line) => {
					const match = /^(MemTotal|MemAvailable|SwapFree|SwapTotal):\s+(\d+)/.exec(line);
					return match ? [[match[1], Number(match[2]) * 1024]] : [];
				}),
		);
		for (const pid of readdirSync(proc).filter((entry) => /^\d+$/.test(entry))) {
			try {
				const args = readFileSync(join(proc, pid, 'cmdline'), 'utf8').split('\0');
				if (!/chrome|chromium|node/.test(args[0] ?? '')) continue;
				const status = readFileSync(join(proc, pid, 'status'), 'utf8');
				result.processes.push({
					pid: Number(pid),
					name: /^Name:\s+(.*)$/m.exec(status)?.[1],
					type: args.find((arg) => /^--type=[a-z-]+$/.test(arg))?.slice(7),
					openFilesLimit: /^Max open files\s+(\S+)\s+(\S+)/m
						.exec(readFileSync(join(proc, pid, 'limits'), 'utf8'))
						?.slice(1),
					rss: Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0) * 1024,
					fds: readdirSync(join(proc, pid, 'fd')).length,
				});
			} catch {
				// Processes can exit between observations or deny access to /proc.
			}
		}
	} catch (error) {
		result.unavailable.push({ metric: 'proc', error: diagnosticError(error) });
	}
	try {
		const disk = statfsSync(diskPath);
		result.diskAvailable = disk.bavail * disk.bsize;
	} catch (error) {
		result.unavailable.push({ metric: 'disk', error: diagnosticError(error) });
	}
	return result;
}
