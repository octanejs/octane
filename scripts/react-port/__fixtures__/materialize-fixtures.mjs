import { gzipSync } from 'node:zlib';
import { gitBlobSha1 } from '../materialize-lib.mjs';

function tarHeader(name, size, typeflag) {
	const header = Buffer.alloc(512);
	header.write(name, 0, 100, 'utf8');
	header.write('0000644\0', 100, 8);
	header.write('0000000\0', 108, 8);
	header.write('0000000\0', 116, 8);
	header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
	header.write('00000000000\0', 136, 12);
	header.write(typeflag, 156, 1);
	header.write('ustar\0', 257, 6);
	header.write('00', 263, 2);
	let checksum = 0;
	for (let index = 0; index < 512; index += 1) {
		checksum += index >= 148 && index < 156 ? 0x20 : header[index];
	}
	header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
	return header;
}

export function buildTarGz(entries) {
	const chunks = [];
	for (const [name, content, typeflag] of entries) {
		if (typeflag === '2') {
			chunks.push(tarHeader(name, 0, '2'));
			continue;
		}
		if (content === null) {
			chunks.push(tarHeader(name, 0, '5'));
			continue;
		}
		const bytes = Buffer.from(content);
		chunks.push(tarHeader(name, bytes.length, '0'), bytes);
		const padding = (512 - (bytes.length % 512)) % 512;
		if (padding > 0) chunks.push(Buffer.alloc(padding));
	}
	chunks.push(Buffer.alloc(1024));
	return gzipSync(Buffer.concat(chunks));
}

export function fixtureIdentity(overrides = {}) {
	return {
		packageName: 'mit-widget',
		version: '1.0.0',
		repository: { owner: 'acme', repo: 'mit-widget', subdirectory: null, ...overrides.repository },
		commit: 'a'.repeat(40),
		integrity: 'sha512-fixture',
		...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'repository')),
	};
}

export const FIXTURE_SOURCES = new Map([
	['LICENSE', 'MIT License fixture\n'],
	['src/index.js', 'export const widget = () => 1;\n'],
	['tests/index.test.js', "import { test } from 'node:test';\ntest('widget', () => {});\n"],
]);

export const RECOGNIZABLE_MIT_TEXT = `MIT License

Copyright (c) 2020 Acme

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY.
`;

export const PIN_FIXTURE_SOURCES = new Map([
	['package.json', '{"name":"mit-widget","version":"1.0.0","license":"MIT"}\n'],
	['LICENSE', RECOGNIZABLE_MIT_TEXT],
	['src/index.js', 'export const widget = () => 1;\n'],
	['tests/index.test.js', "import { test } from 'node:test';\ntest('widget', () => {});\n"],
]);

export function fixtureTreeEntries(sources = FIXTURE_SOURCES, prefix = '') {
	return [...sources.entries()].map(([relativePath, content]) => ({
		path: `${prefix}${relativePath}`,
		type: 'blob',
		mode: '100644',
		sha: gitBlobSha1(Buffer.from(content)),
		size: Buffer.byteLength(content),
	}));
}

export function fixtureArchive(
	sources = FIXTURE_SOURCES,
	prefix = `mit-widget-${'a'.repeat(40)}/`,
) {
	return buildTarGz(
		[...sources.entries()].map(([relativePath, content]) => [`${prefix}${relativePath}`, content]),
	);
}
