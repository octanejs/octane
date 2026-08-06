// Reading a packaged Lynx example.
//
// `example-metadata.json` is @lynx-js/go-web's contract, written by
// scripts/prepare-lynx-examples.mjs — the same file the community <Go> gallery
// reads, so a packaged example is not tied to this site. `example-source.json`
// is this site's own sidecar beside it: the sources already highlighted through
// the docs' Shiki pipeline, so the code panel ships no highlighter.
//
// Both are fetched rather than imported. The highlighted markup is far larger
// than the page that shows it, and only two pages mount a preview at all.

import { LYNX_EXAMPLE_BASE_PATH } from '../../content/lynx-examples.ts';

/** One buildable entry of an example, as @lynx-js/go-web describes it. */
export interface TemplateFile {
	name: string;
	/** Native bundle path, relative to the example root. Lynx Explorer loads this. */
	file: string;
	/** Lynx-for-Web bundle path, when the example was built for the web too. */
	webFile?: string;
}

export interface ExampleMetadata {
	name: string;
	files: string[];
	templateFiles: TemplateFile[];
	previewImage?: string;
	exampleGitBaseUrl?: string;
}

export interface ExampleSourceFile {
	path: string;
	language: string;
	/** Shiki output for the file, with dual-theme token variables. */
	html: string;
}

export interface ExampleSource {
	defaultFile: string;
	files: ExampleSourceFile[];
}

export interface LoadedExample {
	metadata: ExampleMetadata;
	source: ExampleSource;
}

export function exampleRoot(id: string): string {
	return `${LYNX_EXAMPLE_BASE_PATH}/${id}`;
}

export async function loadExample(id: string, signal?: AbortSignal): Promise<LoadedExample> {
	const root = exampleRoot(id);
	const [metadata, source] = await Promise.all([
		fetchJson<ExampleMetadata>(`${root}/example-metadata.json`, signal),
		fetchJson<ExampleSource>(`${root}/example-source.json`, signal),
	]);
	return { metadata, source };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
	return (await response.json()) as T;
}

/** The entry a preview should mount, honouring a caller's explicit choice. */
export function resolveEntry(
	metadata: ExampleMetadata,
	entryName?: string,
): TemplateFile | undefined {
	if (entryName) return metadata.templateFiles.find(({ name }) => name === entryName);
	return metadata.templateFiles[0];
}

/**
 * An absolute URL for a bundle inside the example.
 *
 * Lynx Explorer fetches over the network from a QR scan, so the URL has to
 * carry an origin — and it has to be the origin actually serving this page, or
 * a preview deployment would send readers to production's copy of the bundle.
 */
export function bundleUrl(id: string, file: string): string {
	return new URL(`${exampleRoot(id)}/${file}`, window.location.href).href;
}
