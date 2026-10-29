// The pristine lane: React 19.2.7 and the hash-pinned use-sync-external-store
// 1.7.0 npm artifact, exactly as published.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { compileFunction } from 'node:vm';
import { createUpstreamHarness } from './harness.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const artifactRoot = resolve(packageRoot, 'upstream-artifact/package');
const oracleRequire = createRequire(resolve(packageRoot, 'package.json'));
const React = oracleRequire('react');
if (React.version !== '19.2.7') throw new Error('The pristine React oracle must be 19.2.7');

// Evaluates one CommonJS file of the artifact. Its bare imports resolve through
// the harness registry, so a jest.mock reaches them as it does under Jest.
function loadArtifact(file: string): unknown {
	const filename = resolve(artifactRoot, file);
	const module = { exports: {} };
	const evaluate = compileFunction(
		readFileSync(filename, 'utf8'),
		['exports', 'require', 'module'],
		{
			filename,
		},
	);
	evaluate(
		module.exports,
		(specifier: string) =>
			specifier.startsWith('.')
				? loadArtifact(resolve(dirname(filename), specifier))
				: harness.require(specifier),
		module,
	);
	return module.exports;
}

const harness = createUpstreamHarness({
	modules: {
		react: () => React,
		// React DOM reads its host when it loads; Node tests may install one later.
		'react-dom': () => oracleRequire('react-dom'),
		'react-dom/client': () => oracleRequire('react-dom/client'),
		'react-dom/server': () => oracleRequire('react-dom/server'),
		'use-sync-external-store/shim': () => loadArtifact('shim/index.js'),
		'use-sync-external-store/shim/index.native': () => loadArtifact('shim/index.native.js'),
		'use-sync-external-store/shim/with-selector': () => loadArtifact('shim/with-selector.js'),
	},
	act: (callback) => React.act(callback),
	createRoot: (container) => oracleRequire('react-dom/client').createRoot(container),
	batchedUpdates: (callback) => oracleRequire('react-dom').unstable_batchedUpdates(callback),
});

export const { __DEV__, gate, jest, require } = harness;
