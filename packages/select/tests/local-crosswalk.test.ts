import crosswalk from '../audit/export-crosswalk.json';
import { describe, expect, it } from 'vitest';
import * as localRoot from '../src/index';
import * as localAsync from '../src/async.tsrx';
import * as localCreatable from '../src/creatable.tsrx';
import * as localBase from '../src/base';
import * as localAsyncCreatable from '../src/async-creatable.tsrx';
import * as localAnimated from '../src/animated/index';

// OCTANE DIVERGENCE[react-select-octane-node][types:octane-node-adaptation]: renderer-owned renderable contracts use OctaneNode instead of ReactNode.
// OCTANE DIVERGENCE[react-select-native-events][types:native-event-adaptation]: event-bearing contracts use native DOM events instead of React synthetic events.
// OCTANE DIVERGENCE[react-select-octane-styles][types:octane-style-adaptation]: renderer-owned style contracts use Octane style objects instead of Emotion CSS objects.

const localEntryPoints: Record<string, Record<string, unknown>> = {
	'.': localRoot,
	'./base': localBase,
	'./async': localAsync,
	'./animated': localAnimated,
	'./async-creatable': localAsyncCreatable,
	'./creatable': localCreatable,
};

describe('local public export crosswalk', () => {
	it.each(Object.entries(localEntryPoints))(
		'exposes every %s export marked ported-and-tested',
		(path, localEntryPoint) => {
			const entry = crosswalk.entryPoints.find((candidate) => candidate.path === path);
			expect(entry).toBeDefined();
			const expected = Object.entries(entry!.runtimeExports)
				.filter(([, status]) => status === 'ported-and-tested')
				.map(([name]) => name)
				.sort();
			expect(Object.keys(localEntryPoint).sort()).toEqual(expected);
		},
	);
});
