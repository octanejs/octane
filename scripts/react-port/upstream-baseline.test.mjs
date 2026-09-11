import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { acquireUpstreamBaseline } from './upstream-baseline.mjs';

function git(cwd, ...args) {
	return execFileSync('git', ['-C', cwd, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function remoteFixture(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'upstream-baseline-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const source = path.join(root, 'source');
	const remote = path.join(root, 'remote.git');
	const checkoutParent = path.join(root, 'audits');
	mkdirSync(source);
	mkdirSync(checkoutParent);
	git(source, 'init', '--quiet', '--initial-branch=main');
	git(source, 'config', 'user.email', 'fixture@example.test');
	git(source, 'config', 'user.name', 'Fixture');
	const commit = (value) => {
		writeFileSync(path.join(source, 'value.txt'), value);
		git(source, 'add', 'value.txt');
		git(source, 'commit', '--quiet', '-m', value);
		return git(source, 'rev-parse', 'HEAD');
	};
	const firstSha = commit('first');
	git(root, 'clone', '--quiet', '--bare', source, remote);
	git(source, 'remote', 'add', 'origin', remote);
	return { root, source, remote, checkoutParent, firstSha, commit };
}

test('acquires a detached clean baseline and rediscovers advancements and renamed remote HEAD', (t) => {
	const fixture = remoteFixture(t);
	const acquire = () =>
		acquireUpstreamBaseline({
			repositoryUrl: fixture.remote,
			checkoutParent: fixture.checkoutParent,
		});
	const before = Date.now();
	const initial = acquire();
	assert.equal(initial.status, 'complete');
	assert.equal(initial.repositoryUrl, fixture.remote);
	assert.equal(initial.defaultBranch, 'main');
	assert.equal(initial.sha, fixture.firstSha);
	assert.equal(initial.checkoutStatus, 'clean');
	assert.ok(Date.parse(initial.fetchedAt) >= before);
	assert.equal(git(initial.checkoutPath, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
	assert.equal(git(initial.checkoutPath, 'status', '--porcelain'), '');
	assert.equal(readFileSync(path.join(initial.checkoutPath, 'value.txt'), 'utf8'), 'first');
	const nextSha = fixture.commit('second');
	git(fixture.source, 'push', '--quiet', 'origin', 'main');
	const next = acquire();
	assert.equal(next.sha, nextSha);
	assert.notEqual(next.checkoutPath, initial.checkoutPath);
	assert.equal(readFileSync(path.join(initial.checkoutPath, 'value.txt'), 'utf8'), 'first');
	git(fixture.source, 'checkout', '--quiet', '-b', 'next/default');
	const renamedSha = fixture.commit('renamed');
	git(fixture.source, 'push', '--quiet', 'origin', 'next/default');
	git(fixture.remote, 'symbolic-ref', 'HEAD', 'refs/heads/next/default');
	const renamed = acquire();
	assert.equal(renamed.status, 'complete');
	assert.equal(renamed.defaultBranch, 'next/default');
	assert.equal(renamed.sha, renamedSha);
});

test('a failed revalidation has no usable SHA or earlier success receipt', (t) => {
	const fixture = remoteFixture(t);
	const options = { repositoryUrl: fixture.remote, checkoutParent: fixture.checkoutParent };
	const initial = acquireUpstreamBaseline(options);
	assert.equal(initial.status, 'complete');
	rmSync(fixture.remote, { recursive: true, force: true });
	const failure = acquireUpstreamBaseline(options);
	assert.equal(failure.status, 'incomplete');
	assert.equal(failure.failure.stage, 'discover');
	assert.equal(failure.sha, undefined);
	assert.equal(failure.defaultBranch, undefined);
	assert.equal(failure.fetchedAt, undefined);
	assert.equal(failure.checkoutPath, undefined);
	assert.equal(failure.checkoutStatus, 'unavailable');
	assert.equal(readFileSync(path.join(initial.checkoutPath, 'value.txt'), 'utf8'), 'first');
	const independent = acquireUpstreamBaseline({ ...options, repositoryUrl: fixture.source });
	assert.equal(independent.status, 'complete');
});

test('successful discovery followed by failed fetch cannot produce a current baseline', (t) => {
	const fixture = remoteFixture(t);
	const receipt = acquireUpstreamBaseline({
		repositoryUrl: fixture.remote,
		checkoutParent: fixture.checkoutParent,
		runGit(args, options) {
			const result = execFileSync('git', args, options);
			if (args.includes('ls-remote')) rmSync(fixture.remote, { recursive: true, force: true });
			return result;
		},
	});
	assert.equal(receipt.status, 'incomplete');
	assert.equal(receipt.failure.stage, 'fetch');
	assert.equal(receipt.sha, undefined);
	assert.equal(receipt.fetchedAt, undefined);
	assert.equal(receipt.defaultBranch, undefined);
});

test('dirty caller stays untouched and cannot be selected as managed checkout storage', (t) => {
	const fixture = remoteFixture(t);
	writeFileSync(path.join(fixture.source, 'value.txt'), 'uncommitted');
	writeFileSync(path.join(fixture.source, 'untracked.txt'), 'keep me');
	const status = git(fixture.source, 'status', '--porcelain');
	const isolated = acquireUpstreamBaseline({
		repositoryUrl: fixture.source,
		checkoutParent: fixture.checkoutParent,
	});
	assert.equal(isolated.status, 'complete');
	assert.equal(readFileSync(path.join(isolated.checkoutPath, 'value.txt'), 'utf8'), 'first');
	const forbidden = path.join(fixture.source, 'audit-output');
	const failure = acquireUpstreamBaseline({
		repositoryUrl: fixture.source,
		checkoutParent: forbidden,
	});
	assert.equal(failure.status, 'incomplete');
	assert.equal(failure.failure.stage, 'checkout');
	assert.equal(existsSync(forbidden), false);
	assert.equal(git(fixture.source, 'status', '--porcelain'), status);
	assert.equal(readFileSync(path.join(fixture.source, 'value.txt'), 'utf8'), 'uncommitted');
	assert.equal(git(fixture.source, 'rev-parse', 'HEAD'), fixture.firstSha);
});

test('an empty repository cannot be described as a fetched remote default', (t) => {
	const fixture = remoteFixture(t);
	const empty = path.join(fixture.root, 'empty.git');
	git(fixture.root, 'init', '--quiet', '--bare', empty);
	const receipt = acquireUpstreamBaseline({
		repositoryUrl: empty,
		checkoutParent: fixture.checkoutParent,
	});
	assert.equal(receipt.status, 'incomplete');
	assert.equal(receipt.failure.stage, 'discover');
	assert.match(receipt.failure.message, /default branch/);
});

test('Git execution has a bounded timeout and rejects unsafe remote helper inputs', () => {
	const receipt = acquireUpstreamBaseline({
		repositoryUrl: 'https://example.test/unavailable.git',
		timeoutMs: 125,
		runGit(_args, options) {
			assert.equal(options.timeout, 125);
			const error = new Error('timed out');
			error.code = 'ETIMEDOUT';
			throw error;
		},
	});
	assert.equal(receipt.status, 'incomplete');
	assert.match(receipt.failure.message, /125ms/);
	const unsafe = acquireUpstreamBaseline({ repositoryUrl: 'ext::arbitrary-command' });
	assert.equal(unsafe.status, 'incomplete');
	assert.equal(unsafe.failure.stage, 'input');
});
