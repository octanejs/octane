import { resolve } from 'node:path';
import * as Diffs from '@pierre/diffs';
import * as DiffsWorker from '@pierre/diffs/worker';
import * as ServerRuntime from 'octane/server';
import { vi } from 'vitest';
import { loadServerFixture } from '../../octane/tests/_server-fixture';
import * as Constants from '../src/constants';
import * as AreFileTargetsEqual from '../src/core/areFileTargetsEqual';
import * as GetMergeConflictActionSlotName from '../src/core/getMergeConflictActionSlotName';
import * as ParseMergeConflictDiffFromFile from '../src/core/parseMergeConflictDiffFromFile';
import * as UseNextRenderData from '../src/utils/useNextRenderData';
import type { DiffAppProps } from './_fixtures/app.tsrx';

// One test module cannot be compiled for both the client and the server, so
// hydration tests render their server HTML through server-compiled twins of the
// modules `_fixtures/app.tsrx` reaches. Hookless modules are shared as-is.
const src = resolve(import.meta.dirname, '../src');
const load = (path: string, runtimeModules: Record<string, object>) =>
	loadServerFixture(resolve(src, path), { runtimeModules });

const useStableCallback = load('utils/useStableCallback.ts', {});
const useForceUpdate = load('utils/useForceUpdate.ts', {});
const editContext = load('EditContext.tsrx', { './utils/useStableCallback': useStableCallback });
const virtualizer = load('Virtualizer.tsrx', { '@pierre/diffs': Diffs });
const workerPoolContext = load('WorkerPoolContext.tsrx', { '@pierre/diffs/worker': DiffsWorker });
const fileDiff = load('FileDiff.tsrx', {
	'@pierre/diffs': Diffs,
	'./utils/renderDiffChildren.tsrx': load('utils/renderDiffChildren.tsrx', {
		'@pierre/diffs': Diffs,
		'../constants': Constants,
		'../core/getMergeConflictActionSlotName': GetMergeConflictActionSlotName,
		'../core/parseMergeConflictDiffFromFile': ParseMergeConflictDiffFromFile,
	}),
	'./utils/templateRender.tsrx': load('utils/templateRender.tsrx', {}),
	'./utils/useFileDiffInstance': load('utils/useFileDiffInstance.ts', {
		'@pierre/diffs': Diffs,
		'../core/areFileTargetsEqual': AreFileTargetsEqual,
		'../constants': Constants,
		'../EditContext.tsrx': editContext,
		'../Virtualizer.tsrx': virtualizer,
		'../WorkerPoolContext.tsrx': workerPoolContext,
		'./useForceUpdate': useForceUpdate,
		'./useNextRenderData': UseNextRenderData,
		'./useStableCallback': useStableCallback,
	}),
});
const app = loadServerFixture(resolve(import.meta.dirname, '_fixtures/app.tsrx'), {
	runtimeModules: { '../../src/index.ts': { ...fileDiff, ...virtualizer, ...workerPoolContext } },
});

/**
 * Server-render `_fixtures/app.tsrx`'s DiffApp. A server has no `window`, which
 * the components read to choose their server output, so it is hidden here.
 */
export function renderDiffAppToString(props: DiffAppProps): string {
	vi.stubGlobal('window', undefined);
	try {
		return ServerRuntime.renderToString(ServerRuntime.createElement(app.DiffApp, props)).html;
	} finally {
		vi.unstubAllGlobals();
	}
}
