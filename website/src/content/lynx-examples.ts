// The Lynx examples the site publishes for its <Go> previews.
//
// One manifest, two consumers that must not drift: scripts/prepare-lynx-examples.mjs
// builds and packages each entry into public/lynx-examples/<id>/, and the pages
// name the same ids when they mount a <Go>. The JSON is the shared half so the
// build script can read it without a TypeScript loader.
import type { AutoGestureOptions } from '../components/go/lynx-view/index.ts';
import lynxExamples from './lynx-examples.json';

export interface LynxExample {
	/** Folder name under `/lynx-examples`, and the `<Go example>` id. */
	id: string;
	title: string;
	summary: string;
	/** Where the example lives in this repository, relative to the repo root. */
	directory: string;
	/** Rspeedy entry name, which is also the bundle basename. */
	entry: string;
	/** Source file the code panel opens on. */
	defaultFile: string;
	/** The upstream Lynx tutorial this example ports. */
	tutorial: string;
	/**
	 * Demonstrate the example with simulated touches. A gesture-driven example
	 * shows nothing in an embedded preview otherwise: it binds touch events, so
	 * a desktop reader's mouse does not reach it.
	 */
	autoGesture?: AutoGestureOptions;
}

export const LYNX_EXAMPLES = lynxExamples satisfies LynxExample[];

export function findLynxExample(id: string): LynxExample | undefined {
	return LYNX_EXAMPLES.find((example) => example.id === id);
}

/** Where the packaged example is served from, and where <Go> fetches it. */
export const LYNX_EXAMPLE_BASE_PATH = '/lynx-examples';

/** Where prepare-lynx-examples.mjs copies the @lynx-js/web-core client build. */
export const LYNX_RUNTIME_BASE_PATH = '/lynx-runtime';

export function lynxExampleRepositoryHref(example: LynxExample): string {
	return `https://github.com/octanejs/octane/tree/main/${example.directory}`;
}
