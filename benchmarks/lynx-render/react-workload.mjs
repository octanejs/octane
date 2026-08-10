import fs from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REACT_PACKAGE = path.dirname(require.resolve('@lynx-js/react/package.json'));
const reactRequire = createRequire(path.join(REACT_PACKAGE, 'package.json'));
const PREACT_PACKAGE = path.dirname(reactRequire.resolve('preact/package.json'));
const PREACT_PACKAGE_URL = pathToFileURL(`${PREACT_PACKAGE}${path.sep}`).href;
const REACT_RESOLUTION_URL = pathToFileURL(path.join(REACT_PACKAGE, 'package.json')).href;

// Keep the authored ReactLynx fixture equivalent to App.lynx.tsrx, then run
// its published production Snapshot compiler instead of timing uncompiled JSX.
const APP_SOURCE = `
import { useState } from '@lynx-js/react';

export function BenchApp(props) {
  const [selected, setSelected] = useState(0);
  const [removed, setRemoved] = useState(0);

  return (
    <view className="container">
      <view className="jumbotron">
        <text className="title">Octane Lynx</text>
        <text className="stats">{'selected=' + selected + ' removed=' + removed}</text>
      </view>
      <view className="table">
        {props.rows.map((row) => (
          <view
            className={row.id === selected ? 'row danger' : 'row'}
            id={'row-' + row.id}
            key={row.id}
          >
            <text className="col-id">{String(row.id)}</text>
            <view className="col-label" bindtap={() => setSelected(row.id)}>
              <text>{row.label}</text>
            </view>
            <view className="col-remove" bindtap={() => setRemoved((count) => count + 1)}>
              <text>x</text>
            </view>
          </view>
        ))}
      </view>
    </view>
  );
}

export function EmptyApp() {
  return <view className="container" />;
}
`;

const PRODUCTION_FLAGS = {
	__DEV__: false,
	__PROFILE__: false,
	__ALOG__: false,
	__ALOG_ELEMENT_API__: false,
	__FIRST_SCREEN_SYNC_TIMING__: 'immediately',
	__ENABLE_SSR__: false,
	__USE_ELEMENT_TEMPLATE__: false,
};

function applyProductionFlags(environment) {
	Object.assign(environment.mainThread.globalThis, PRODUCTION_FLAGS);
	Object.assign(environment.backgroundThread.globalThis, PRODUCTION_FLAGS);
}

async function settle() {
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

function compileProductionApp(tempDir) {
	const { transformReactLynxSync } = require('@lynx-js/react/transform');
	const result = transformReactLynxSync(APP_SOURCE, {
		mode: 'production',
		pluginName: '',
		filename: 'App.jsx',
		sourcemap: false,
		snapshot: {
			preserveJsx: false,
			runtimePkg: '@lynx-js/react/internal',
			jsxImportSource: '@lynx-js/react',
			filename: 'App.jsx',
			target: 'MIXED',
		},
		dynamicImport: false,
		directiveDCE: false,
		defineDCE: false,
		shake: false,
		compat: false,
		worklet: false,
		refresh: false,
		cssScope: false,
	});
	if (result.errors.length !== 0) {
		throw new Error(`ReactLynx production compilation failed: ${JSON.stringify(result.errors)}`);
	}

	// The build artifact lives in the runner's OS temporary directory, outside
	// the workspace's module-resolution ancestry. Rewrite only the compiler's
	// static package imports to the exact pinned benchmark dependency.
	const code = result.code.replace(
		/from (["'])(@lynx-js\/react(?:\/jsx-runtime|\/internal)?)\1/g,
		(_match, quote, specifier) =>
			`from ${quote}${pathToFileURL(require.resolve(specifier)).href}${quote}`,
	);
	const filename = path.join(tempDir, 'react-workload.mjs');
	fs.writeFileSync(filename, code);
	return import(pathToFileURL(filename).href);
}

export async function createReactWorkload(workload, tempDir) {
	// ReactLynx aliases its exact internal-preact fork to `preact`. Under pnpm,
	// imports originating inside that fork can otherwise escape its virtual
	// dependency and resolve the workspace's unrelated stock Preact instead.
	// Preserve the real published fork and its ESM conditions while giving only
	// its own self-imports the same resolution context as ReactLynx itself.
	const preactResolution = registerHooks({
		resolve(specifier, context, nextResolve) {
			if (
				(specifier === 'preact' || specifier.startsWith('preact/')) &&
				typeof context.parentURL === 'string' &&
				context.parentURL.startsWith(PREACT_PACKAGE_URL)
			) {
				return nextResolve(specifier, { ...context, parentURL: REACT_RESOLUTION_URL });
			}
			return nextResolve(specifier, context);
		},
	});
	const testing = await import(
		pathToFileURL(path.join(REACT_PACKAGE, 'testing-library/dist/env/index.js')).href
	);
	const window = {
		console,
		Event,
		Node: class Node {},
		document: { body: { innerHTML: '', appendChild() {} } },
	};
	testing.installLynxTestingEnv(globalThis, { window });
	const environment = globalThis.lynxTestingEnv;
	applyProductionFlags(environment);
	environment.switchToBackgroundThread();

	await import(
		pathToFileURL(
			path.join(REACT_PACKAGE, 'testing-library/dist/setupFiles/common/runtime-setup.js'),
		).href
	);
	environment.switchToBackgroundThread();
	const ReactLynx = await import(pathToFileURL(require.resolve('@lynx-js/react')).href);
	const app = await compileProductionApp(tempDir);

	function createHarness() {
		environment.reset();
		applyProductionFlags(environment);
		const papi = new workload.FakeElementPAPI();
		const api = papi.globals();
		Object.assign(environment.mainThread.globalThis, api, {
			__CreatePage(...args) {
				const page = api.__CreatePage(...args);
				environment.mainThread.elementTree.root = page;
				return page;
			},
			__AppendElement(parent, child) {
				api.__InsertElementBefore(parent, child);
			},
			__CreateWrapperElement() {
				return api.__CreateElement('wrapper');
			},
			__FirstElement(node) {
				return node.children[0];
			},
			__GetTag(node) {
				return node.type;
			},
			__GetPageElement() {
				return environment.mainThread.elementTree.root;
			},
			__GetDataset(node) {
				return node.attributes?.get('dataset') ?? {};
			},
			__GetAttributeByName(node, name) {
				return node.attributes?.get(name) ?? null;
			},
		});

		// Octane creates its root/page before the timer starts. Match that
		// boundary by bootstrapping ReactLynx's empty main-thread first screen,
		// then time the background render and its real native Snapshot patch.
		environment.switchToMainThread();
		ReactLynx.root.render(null);
		globalThis.renderPage();
		environment.switchToBackgroundThread();
		return { papi, backgroundTarget: environment.backgroundThread.globalThis };
	}

	async function run(component, rows) {
		const harness = createHarness();
		const started = performance.now();
		ReactLynx.root.render(ReactLynx.createElement(component, rows === undefined ? {} : { rows }));
		await settle();
		const durationMs = performance.now() - started;
		return {
			durationMs,
			createdElements: harness.papi.createdElements,
			checksum: harness.papi.checksum(),
			reachableChecksum: harness.papi.reachableChecksum(),
			eventTokens: harness.papi.eventTokens().length,
			privateSelectors: harness.papi.privateRefSelectors(),
			diagnostics: [],
		};
	}

	return {
		version: require('@lynx-js/react/package.json').version,
		runEmptyStartup() {
			return run(app.EmptyApp);
		},
		runCreateRows(count) {
			return run(app.BenchApp, workload.makeRows(count));
		},
		async runUpdateRows(count) {
			const harness = createHarness();
			ReactLynx.root.render(
				ReactLynx.createElement(app.BenchApp, { rows: workload.makeRows(count) }),
			);
			await settle();
			const token = harness.papi.eventTokens()[0];
			const publishEvent = harness.backgroundTarget.lynxCoreInject?.tt?.publishEvent;
			if (token === undefined || typeof publishEvent !== 'function') {
				throw new Error('ReactLynx update benchmark requires a mounted native tap handler.');
			}
			const started = performance.now();
			publishEvent(token, {
				type: 'tap',
				timestamp: 1,
				target: { id: 'row-1', uid: 1, dataset: {} },
				currentTarget: { id: 'row-1', uid: 1, dataset: {} },
			});
			await settle();
			const durationMs = performance.now() - started;
			return {
				durationMs,
				createdElements: harness.papi.createdElements,
				checksum: harness.papi.checksum(),
				reachableChecksum: harness.papi.reachableChecksum(),
				eventTokens: harness.papi.eventTokens().length,
				privateSelectors: harness.papi.privateRefSelectors(),
				diagnostics: [],
			};
		},
		async runClick(count) {
			const harness = createHarness();
			ReactLynx.root.render(
				ReactLynx.createElement(app.BenchApp, { rows: workload.makeRows(count) }),
			);
			await settle();
			const tokens = harness.papi.eventTokens();
			const before = harness.papi.reachableChecksum();
			const publishEvent = harness.backgroundTarget.lynxCoreInject?.tt?.publishEvent;
			const reachableChecksums = [before];
			if (tokens.length >= 3 && typeof publishEvent === 'function') {
				for (let index = 0; index < 3; index++) {
					const row = index < 2 ? 1 : 2;
					publishEvent(tokens[index], {
						type: 'tap',
						timestamp: index + 1,
						target: { id: `row-${row}`, uid: row, dataset: {} },
						currentTarget: { id: `row-${row}`, uid: row, dataset: {} },
					});
					await settle();
					reachableChecksums.push(harness.papi.reachableChecksum());
				}
			}
			const after = harness.papi.reachableChecksum();
			return {
				tokens: tokens.length,
				engineHookInstalled: typeof publishEvent === 'function',
				handled:
					reachableChecksums.length === 4 &&
					reachableChecksums.every(
						(value, index) => index === 0 || value !== reachableChecksums[index - 1],
					),
				reachableChecksumBefore: before,
				reachableChecksumAfter: after,
				reachableChecksums,
				diagnostics: [],
			};
		},
		dispose() {
			environment.clearGlobal();
			testing.uninstallLynxTestingEnv(globalThis);
			preactResolution.deregister();
		},
	};
}
