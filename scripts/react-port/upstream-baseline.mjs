import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sanitizeForReport } from './report-lib.mjs';

function isolatedEnvironment() {
	const environment = { ...process.env };
	// A caller's Git context must not redirect operations into its checkout.
	for (const key of Object.keys(environment)) {
		if (
			/^GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG.*)$/.test(
				key,
			)
		) {
			delete environment[key];
		}
	}
	return {
		...environment,
		GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_CONFIG_NOSYSTEM: '1',
		GIT_TERMINAL_PROMPT: '0',
	};
}

export function storageIsInRepository(directory) {
	let ancestor = path.resolve(directory);
	while (!existsSync(ancestor) && path.dirname(ancestor) !== ancestor) {
		ancestor = path.dirname(ancestor);
	}
	ancestor = realpathSync(ancestor);
	for (;;) {
		if (
			existsSync(path.join(ancestor, '.git')) ||
			(existsSync(path.join(ancestor, 'HEAD')) && existsSync(path.join(ancestor, 'objects')))
		)
			return true;
		const parent = path.dirname(ancestor);
		if (parent === ancestor) return false;
		ancestor = parent;
	}
}

/**
 * Acquire a fresh remote-default checkout. Every call uses new storage, so a
 * failed refresh cannot silently reuse an earlier receipt. Callers own retention
 * of successful checkouts and invalidation of findings tied to older SHAs.
 */
export function acquireUpstreamBaseline({
	repositoryUrl,
	checkoutParent = tmpdir(),
	timeoutMs = 30_000,
	runGit = execFileSync.bind(null, 'git'),
	now = () => new Date().toISOString(),
} = {}) {
	let stage = 'input';
	let checkoutPath;
	const receipt = {
		repositoryUrl: sanitizeForReport(repositoryUrl),
		checkoutStatus: 'unavailable',
	};
	try {
		if (
			typeof repositoryUrl !== 'string' ||
			!repositoryUrl.trim() ||
			repositoryUrl.startsWith('-') ||
			repositoryUrl.includes('\0') ||
			/^[a-z][\w+.-]*::/i.test(repositoryUrl)
		) {
			throw new Error('Expected a repository URL or local repository path');
		}
		if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
			throw new Error('timeoutMs must be an integer between 1 and 60000');
		}
		const url = URL.canParse(repositoryUrl) ? new URL(repositoryUrl) : null;
		if (url && ['http:', 'https:'].includes(url.protocol) && (url.username || url.password)) {
			throw new Error('Repository URLs must not contain credentials');
		}
		const environment = isolatedEnvironment();
		function git(args, cwd = tmpdir()) {
			try {
				return String(
					runGit(
						[
							'-c',
							'core.hooksPath=/dev/null',
							'-c',
							'protocol.allow=never',
							...['file', 'https', 'http', 'ssh', 'git'].flatMap((protocol) => [
								'-c',
								`protocol.${protocol}.allow=always`,
							]),
							...args,
						],
						{
							cwd,
							encoding: 'utf8',
							stdio: ['ignore', 'pipe', 'pipe'],
							timeout: timeoutMs,
							maxBuffer: 1024 * 1024,
							env: environment,
						},
					),
				).trim();
			} catch (error) {
				// Git errors may echo authenticated URLs or helper output. Keep the
				// receipt diagnostic useful without including subprocess payloads.
				throw new Error(
					error.code === 'ETIMEDOUT'
						? `Git ${args[0]} timed out after ${timeoutMs}ms`
						: `Git ${args[0]} failed (${error.code ?? `exit ${error.status ?? 'unknown'}`})`,
				);
			}
		}
		stage = 'checkout';
		if (storageIsInRepository(checkoutParent)) {
			throw new Error('Managed baseline storage must be outside existing repositories');
		}
		stage = 'discover';
		const remoteHead = git(['ls-remote', '--symref', '--', repositoryUrl, 'HEAD']);
		const defaultBranch = /^ref: refs\/heads\/(.+)\tHEAD$/m.exec(remoteHead)?.[1];
		const advertisedSha = /^([a-f0-9]{40}|[a-f0-9]{64})\tHEAD$/m.exec(remoteHead)?.[1];
		if (!defaultBranch || !advertisedSha)
			throw new Error('Remote HEAD does not identify a default branch commit');
		git(['check-ref-format', `refs/heads/${defaultBranch}`]);
		stage = 'checkout';
		mkdirSync(checkoutParent, { recursive: true });
		checkoutPath = mkdtempSync(path.join(path.resolve(checkoutParent), 'binding-baseline-'));
		git(
			[
				'init',
				'--quiet',
				'--template=',
				`--object-format=${advertisedSha.length === 64 ? 'sha256' : 'sha1'}`,
			],
			checkoutPath,
		);
		git(['remote', 'add', 'origin', repositoryUrl], checkoutPath);
		stage = 'fetch';
		git(
			['fetch', '--quiet', '--depth=1', '--no-tags', 'origin', `refs/heads/${defaultBranch}`],
			checkoutPath,
		);
		const fetchedAt = now();
		const sha = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], checkoutPath);
		if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha))
			throw new Error('Fetch did not resolve a full commit SHA');
		stage = 'checkout';
		git(['checkout', '--quiet', '--detach', sha], checkoutPath);
		if (
			git(['rev-parse', 'HEAD'], checkoutPath) !== sha ||
			git(['status', '--porcelain=v1', '--untracked-files=all'], checkoutPath)
		) {
			throw new Error('Fetched checkout is not clean at the recorded SHA');
		}
		return {
			...receipt,
			status: 'complete',
			defaultBranch,
			sha,
			fetchedAt,
			checkoutPath,
			checkoutStatus: 'clean',
		};
	} catch (error) {
		if (checkoutPath) rmSync(checkoutPath, { recursive: true, force: true });
		return { ...receipt, status: 'incomplete', failure: { stage, message: error.message } };
	}
}
