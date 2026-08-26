import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import ts from 'typescript';
import { bridgeReportFromSource } from '../../packages/octane-mcp-server/src/bridge.js';
import {
	extractTestCases,
	findPossibleUnexpandedRegistrars,
} from '../react-parity/inventory-lib.mjs';
import { decodePathPart, parseGitHubUrl, parseInput } from './input-lib.mjs';
import { fingerprint, sanitizeForReport, stableStringify } from './report-lib.mjs';
import { selectHighestSatisfyingVersion } from './version-lib.mjs';

const SUPPORTED_INTEGRITY_ALGORITHMS = ['sha512', 'sha384', 'sha256'];

const DEFAULT_ARCHIVE_LIMITS = Object.freeze({
	maxFiles: 10_000,
	maxFileBytes: 100 * 1024 * 1024,
	maxTotalBytes: 250 * 1024 * 1024,
	maxHeaders: 40_000,
	maxMetadataBytes: 8 * 1024 * 1024,
	maxDepth: 32,
});
const REMOTE_LIMITS = Object.freeze({
	jsonBytes: 8 * 1024 * 1024,
	artifactBytes: 32 * 1024 * 1024,
	expandedArtifactBytes: 300 * 1024 * 1024,
	licenseBytes: 1024 * 1024,
	redirects: 3,
	requestTimeoutMs: 30_000,
});
const LICENSE_NAME_PATTERN = /^(?:licen[cs]e|copying)(?:\..*)?$/i;
const NOTICE_NAME_PATTERN = /^notice(?:\..*)?$/i;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const SOURCE_SKIP_PARTS = new Set([
	'__tests__',
	'docs',
	'examples',
	'fixtures',
	'node_modules',
	'test',
	'tests',
]);
const MAX_SOURCE_FILES = 400;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const TEST_SOURCE_PATTERN = /\.(?:[cm]?[jt]sx?|coffee)$/i;
const TEST_CONFIG_PATTERN =
	/^(?:(?:vitest|vite|jest|karma|mocha|ava|webpack)\.config|test(?:s)?\.config)\.[cm]?[jt]s$/i;
const MAX_UPSTREAM_TEST_FILES = 500;
const MAX_UPSTREAM_TEST_BYTES = 16 * 1024 * 1024;

export const APPROVED_LICENSE_IDENTIFIERS = Object.freeze([
	'MIT',
	'Unlicense',
	'BSD-3-Clause',
	'Apache-2.0',
]);

export { fingerprint, parseInput, sanitizeForReport, stableStringify };

function normalizeLicenseText(content) {
	return content
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

export function isRecognizableMitText(content) {
	if (typeof content !== 'string') return false;
	const text = normalizeLicenseText(content);
	return [
		'permission is hereby granted, free of charge, to any person obtaining a copy',
		'the above copyright notice and this permission notice shall be included in all copies or substantial portions of the software',
		'the software is provided "as is", without warranty of any kind',
		'in no event shall the authors or copyright holders be liable for any claim, damages or other liability',
	].every((phrase) => text.includes(phrase));
}

export function isRecognizableUnlicenseText(content) {
	if (typeof content !== 'string') return false;
	const text = normalizeLicenseText(content);
	return [
		'this is free and unencumbered software released into the public domain',
		'anyone is free to copy, modify, publish, use, compile, sell, or distribute this software',
		'the author or authors of this software dedicate any and all copyright interest in the software to the public domain',
		'the software is provided "as is", without warranty of any kind',
		'in no event shall the authors be liable for any claim, damages or other liability',
	].every((phrase) => text.includes(phrase));
}

export function isRecognizableBsd3Text(content) {
	if (typeof content !== 'string') return false;
	const text = normalizeLicenseText(content);
	return [
		'redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met',
		'redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer',
		'neither the name of',
		'this software is provided by the copyright holders and contributors "as is"',
	].every((phrase) => text.includes(phrase));
}

export function isRecognizableApache2Text(content) {
	if (typeof content !== 'string') return false;
	const text = normalizeLicenseText(content);
	// The required phrases come from the license body (sections 1-9), so a
	// terms-only copy without the appendix passes and a short "Licensed under
	// the Apache License" notice header alone does not.
	return [
		'apache license',
		'version 2.0',
		'"license" shall mean the terms and conditions for use, reproduction, and distribution as defined by sections 1 through 9',
		'grant of copyright license',
		'grant of patent license',
		'redistribution',
		'unless required by applicable law or agreed to in writing',
	].every((phrase) => text.includes(phrase));
}

export function classifyApprovedLicenseText(content) {
	if (isRecognizableMitText(content)) return 'MIT';
	if (isRecognizableUnlicenseText(content)) return 'Unlicense';
	if (isRecognizableBsd3Text(content)) return 'BSD-3-Clause';
	if (isRecognizableApache2Text(content)) return 'Apache-2.0';
	return 'unrecognized';
}

function sha256(content) {
	return createHash('sha256').update(content).digest('hex');
}

function blockLicense(reasons, evidence, notices) {
	return {
		status: 'blocked',
		spdx: null,
		reasons,
		evidence,
		notices,
		obligations: [],
	};
}

export function evaluateApprovedLicense({ manifestLicense, licenseFiles = [], noticeFiles = [] }) {
	const evidence = licenseFiles
		.map((file) => ({
			path: file.path,
			scope: file.scope ?? 'unspecified',
			classification: classifyApprovedLicenseText(file.content),
			sha256: sha256(file.content ?? ''),
		}))
		.sort((left, right) => left.path.localeCompare(right.path));
	const notices = noticeFiles
		.map((file) => ({
			path: file.path,
			scope: file.scope ?? 'unspecified',
			sha256: sha256(file.content ?? ''),
		}))
		.sort((left, right) => left.path.localeCompare(right.path));
	const reasons = [];
	let approvedSpdx = null;

	if (typeof manifestLicense !== 'string' || !manifestLicense.trim()) {
		reasons.push('The package manifest does not declare a license.');
	} else if (APPROVED_LICENSE_IDENTIFIERS.includes(manifestLicense)) {
		approvedSpdx = manifestLicense;
		// Exact SPDX metadata is required; compound expressions and aliases fail closed.
	} else {
		const referencedFile = /^SEE LICENSE IN (.+)$/i.exec(manifestLicense)?.[1];
		if (!referencedFile) {
			reasons.push(
				`The package manifest license is not approved by Octane policy: ${manifestLicense}`,
			);
		} else {
			const normalizedReference = path.posix.normalize(referencedFile).toLowerCase();
			const match = licenseFiles.find((file) => {
				const normalizedPath = path.posix.normalize(file.path).toLowerCase();
				return (
					normalizedPath === normalizedReference ||
					(file.scope === 'package' && normalizedPath.endsWith(`/${normalizedReference}`))
				);
			});
			const classification = match ? classifyApprovedLicenseText(match.content) : 'unrecognized';
			if (!match || classification === 'unrecognized') {
				reasons.push(
					`The referenced license file ${referencedFile} is missing or is not recognizable approved-license text.`,
				);
			} else {
				approvedSpdx = classification;
			}
		}
	}

	if (licenseFiles.length === 0) {
		reasons.push('No license file was found in the applicable package scope.');
	} else {
		for (const item of evidence) {
			if (item.classification === 'unrecognized') {
				reasons.push(`License evidence ${item.path} is not recognizable approved-license text.`);
			} else if (approvedSpdx && item.classification !== approvedSpdx) {
				reasons.push(
					`License evidence ${item.path} is ${item.classification}, which conflicts with ${approvedSpdx}.`,
				);
			}
		}
	}

	if (reasons.length > 0) return blockLicense(reasons, evidence, notices);
	return {
		status: 'passed',
		spdx: approvedSpdx,
		reasons: [],
		evidence,
		notices,
		obligations: [
			{
				MIT: 'Retain the upstream copyright and permission notice in all copies or substantial portions of the software.',
				Unlicense:
					'Retain the upstream Unlicense text with copied or adapted source to preserve provenance and its warranty disclaimer.',
				'BSD-3-Clause':
					'Retain the upstream copyright notice, the BSD-3-Clause conditions list, and its disclaimer with copied or adapted source; do not use upstream names to endorse the binding.',
				'Apache-2.0':
					'Retain the upstream Apache-2.0 license text with copied or adapted source and preserve every upstream NOTICE file.',
			}[approvedSpdx],
			...(notices.length > 0
				? ['Retain every applicable upstream NOTICE file and attribution in the completed binding.']
				: []),
		],
	};
}

function sameRepository(left, right) {
	return (
		left?.owner?.toLowerCase() === right?.owner?.toLowerCase() &&
		left?.repo?.toLowerCase() === right?.repo?.toLowerCase() &&
		(left?.subdirectory ?? null) === (right?.subdirectory ?? null)
	);
}

export function assessResolvedEvidence({ input, registry, source }) {
	const blockers = [];
	for (const [label, value] of [
		['published package', registry],
		['immutable source', source],
	]) {
		if (!value || typeof value !== 'object') blockers.push(`Missing ${label} evidence.`);
	}
	if (blockers.length > 0) {
		return {
			input,
			status: 'blocked',
			blockers,
			repair: 'Supply both published and source evidence.',
		};
	}

	if (registry.name !== source.name) {
		blockers.push(
			`Published package name ${registry.name} does not match source name ${source.name}.`,
		);
	}
	if (registry.version !== source.version) {
		blockers.push(
			`Published package version ${registry.version} does not match source version ${source.version}.`,
		);
	}
	if (!sameRepository(registry.repository, source.repository)) {
		blockers.push(
			'Published repository identity or package subdirectory does not match immutable source.',
		);
	}
	if (!/^[0-9a-f]{40}$/i.test(registry.gitHead ?? '')) {
		blockers.push('Published package metadata does not contain an immutable 40-character gitHead.');
	} else if (registry.gitHead.toLowerCase() !== source.commit?.toLowerCase()) {
		blockers.push(
			`Published gitHead ${registry.gitHead} does not match source commit ${source.commit}.`,
		);
	}
	if (typeof registry.integrity !== 'string' || !registry.integrity) {
		blockers.push('Published package artifact has no verified integrity identifier.');
	}

	const publishedLicense = evaluateApprovedLicense(registry);
	const sourceLicense = evaluateApprovedLicense(source);
	for (const [label, verdict] of [
		['Published artifact', publishedLicense],
		['Immutable source', sourceLicense],
	]) {
		if (verdict.status !== 'passed') {
			blockers.push(...verdict.reasons.map((reason) => `${label}: ${reason}`));
		}
	}
	if (
		publishedLicense.status === 'passed' &&
		sourceLicense.status === 'passed' &&
		publishedLicense.spdx !== sourceLicense.spdx
	) {
		blockers.push(
			`Published artifact license ${publishedLicense.spdx} does not match immutable source license ${sourceLicense.spdx}.`,
		);
	}

	const identity = {
		packageName: registry.name,
		version: registry.version,
		repository: registry.repository,
		commit: source.commit,
		integrity: registry.integrity,
	};
	const fingerprintInput = {
		identity,
		publishedLicense: {
			spdx: publishedLicense.spdx,
			evidence: publishedLicense.evidence,
			notices: publishedLicense.notices,
		},
		sourceLicense: {
			spdx: sourceLicense.spdx,
			evidence: sourceLicense.evidence,
			notices: sourceLicense.notices,
		},
	};

	return sanitizeForReport({
		input,
		status: blockers.length === 0 ? 'licensed' : 'blocked',
		identity,
		license: {
			policy: 'approved-license-v2',
			published: publishedLicense,
			source: sourceLicense,
			obligations:
				blockers.length === 0
					? [...new Set([...publishedLicense.obligations, ...sourceLicense.obligations])]
					: [],
			disclaimer: 'Repository policy check only; not legal advice.',
		},
		blockers,
		repair:
			blockers.length === 0
				? null
				: 'Resolve every identity conflict and supply matching approved-license evidence (MIT, Unlicense, BSD-3-Clause, or Apache-2.0) without overriding the policy gate.',
		evidenceFingerprint: fingerprint(fingerprintInput),
	});
}

export function verifyIntegrity(bytes, integrity) {
	if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
		throw new TypeError('Artifact bytes must be a Buffer or Uint8Array');
	}
	if (typeof integrity !== 'string' || !integrity.trim()) {
		throw new Error('Registry artifact integrity is required');
	}

	const declarations = integrity
		.trim()
		.split(/\s+/)
		.map((declaration) => {
			const match = /^(sha(?:256|384|512))-([A-Za-z0-9+/]+={0,2})(?:\?.*)?$/.exec(declaration);
			return match ? { algorithm: match[1], digest: match[2] } : null;
		})
		.filter(Boolean);
	const selected = SUPPORTED_INTEGRITY_ALGORITHMS.map((algorithm) =>
		declarations.find((declaration) => declaration.algorithm === algorithm),
	).find(Boolean);
	if (!selected) throw new Error('Registry artifact integrity uses no supported algorithm');

	const expected = Buffer.from(selected.digest, 'base64');
	const actual = createHash(selected.algorithm).update(bytes).digest();
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
		throw new Error('Registry artifact integrity mismatch');
	}
	return { algorithm: selected.algorithm, digest: selected.digest };
}

function validateArchivePath(entryPath, maxDepth) {
	if (
		typeof entryPath !== 'string' ||
		!entryPath ||
		entryPath.includes('\0') ||
		entryPath.includes('\\') ||
		path.posix.isAbsolute(entryPath)
	) {
		throw new Error(`Unsafe archive path: ${String(entryPath)}`);
	}
	const parts = entryPath.split('/').filter(Boolean);
	if (
		parts.length === 0 ||
		parts.length > maxDepth ||
		parts.some((part) => part === '.' || part === '..')
	) {
		throw new Error(`Unsafe archive path: ${entryPath}`);
	}
	return parts;
}

export function validateArchiveEntries(entries, limits = {}) {
	if (!Array.isArray(entries)) throw new TypeError('Archive entries must be an array');
	const resolvedLimits = { ...DEFAULT_ARCHIVE_LIMITS, ...limits };
	let fileCount = 0;
	let totalBytes = 0;
	const paths = new Set();

	for (const entry of entries) {
		validateArchivePath(entry.path, resolvedLimits.maxDepth);
		if (paths.has(entry.path)) throw new Error(`Duplicate archive path: ${entry.path}`);
		paths.add(entry.path);
		if (entry.type === 'directory') continue;
		if (entry.type !== 'file') throw new Error(`Unsupported archive entry type: ${entry.type}`);
		if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
			throw new Error(`Invalid archive entry size: ${entry.path}`);
		}
		if (entry.size > resolvedLimits.maxFileBytes) {
			throw new Error(`Archive entry exceeds the per-file limit: ${entry.path}`);
		}
		fileCount += 1;
		totalBytes += entry.size;
		if (fileCount > resolvedLimits.maxFiles || totalBytes > resolvedLimits.maxTotalBytes) {
			throw new Error('Archive exceeds resource limits');
		}
	}

	return { fileCount, totalBytes };
}

function readTarString(header, start, length) {
	const end = header.indexOf(0, start);
	const boundedEnd = end === -1 || end > start + length ? start + length : end;
	return header.subarray(start, boundedEnd).toString('utf8').trim();
}

function readTarOctal(header, start, length, label) {
	const value = readTarString(header, start, length).trim();
	if (!/^[0-7]+$/.test(value)) throw new Error(`Invalid archive ${label}`);
	const parsed = Number.parseInt(value, 8);
	if (!Number.isSafeInteger(parsed)) throw new Error(`Archive ${label} is too large`);
	return parsed;
}

function verifyTarHeaderChecksum(header) {
	const expected = readTarOctal(header, 148, 8, 'header checksum');
	let actual = 0;
	for (let index = 0; index < header.length; index += 1) {
		actual += index >= 148 && index < 156 ? 0x20 : header[index];
	}
	if (actual !== expected) throw new Error('Archive header checksum mismatch');
}

function readPaxOverrides(data) {
	const overrides = new Map();
	let offset = 0;
	while (offset < data.length) {
		const separator = data.indexOf(0x20, offset);
		if (separator === -1) throw new Error('Invalid archive pax record length');
		const lengthText = data.subarray(offset, separator).toString('ascii');
		if (!/^[1-9][0-9]*$/.test(lengthText)) {
			throw new Error('Invalid archive pax record length');
		}
		const length = Number(lengthText);
		const recordEnd = offset + length;
		if (!Number.isSafeInteger(length) || recordEnd <= separator + 1 || recordEnd > data.length) {
			throw new Error('Invalid archive pax record length');
		}
		const record = data.subarray(separator + 1, recordEnd);
		if (record.at(-1) !== 0x0a) throw new Error('Invalid archive pax record terminator');
		const payload = record.subarray(0, -1).toString('utf8');
		const equals = payload.indexOf('=');
		if (equals <= 0) throw new Error('Invalid archive pax record');
		const key = payload.slice(0, equals);
		if (key === 'path' || key === 'size') overrides.set(key, payload.slice(equals + 1));
		offset = recordEnd;
	}
	return overrides;
}

function applyGlobalPaxOverrides(globalOverrides, overrides) {
	for (const [key, value] of overrides) {
		if (value === '') globalOverrides.delete(key);
		else globalOverrides.set(key, value);
	}
}

function readGnuLongName(data) {
	const terminator = data.indexOf(0);
	const value = data.subarray(0, terminator === -1 ? data.length : terminator).toString('utf8');
	if (!value) throw new Error('Invalid archive GNU long-name record');
	return value;
}

function readPaxSize(value, fallback) {
	if (value === undefined || value === '') return fallback;
	if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new Error('Invalid archive pax entry size');
	const size = Number(value);
	if (!Number.isSafeInteger(size)) throw new Error('Archive pax entry size is too large');
	return size;
}

export function parseTarArchive(
	bytes,
	{ select = () => false, skip = () => false, limits = {} } = {},
) {
	if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
		throw new TypeError('Archive bytes must be a Buffer or Uint8Array');
	}
	const archive = Buffer.from(bytes);
	const entries = [];
	const files = new Map();
	const resolvedLimits = { ...DEFAULT_ARCHIVE_LIMITS, ...limits };
	const globalPaxOverrides = new Map();
	const pendingPaxOverrides = new Map();
	let headerCount = 0;
	let metadataBytes = 0;
	let offset = 0;

	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		verifyTarHeaderChecksum(header);

		const name = readTarString(header, 0, 100);
		const prefix = readTarString(header, 345, 155);
		const headerPath = prefix ? `${prefix}/${name}` : name;
		const headerSize = readTarOctal(header, 124, 12, 'entry size');
		const typeFlag = readTarString(header, 156, 1);
		const metadataType = typeFlag === 'x' || typeFlag === 'g' || typeFlag === 'L';
		const pathOverride = pendingPaxOverrides.has('path')
			? pendingPaxOverrides.get('path')
			: globalPaxOverrides.get('path');
		const entryPath = metadataType ? headerPath : pathOverride || headerPath;
		const sizeOverride = pendingPaxOverrides.has('size')
			? pendingPaxOverrides.get('size')
			: globalPaxOverrides.get('size');
		const size = metadataType ? headerSize : readPaxSize(sizeOverride, headerSize);
		headerCount += 1;
		if (headerCount > resolvedLimits.maxHeaders) throw new Error('Archive header limit exceeded');
		if (metadataType) {
			metadataBytes += size;
			if (metadataBytes > resolvedLimits.maxMetadataBytes) {
				throw new Error('Archive metadata limit exceeded');
			}
		}

		const dataStart = offset + 512;
		const dataEnd = dataStart + size;
		if (dataEnd > archive.length) throw new Error(`Archive entry is truncated: ${entryPath}`);
		const data = archive.subarray(dataStart, dataEnd);
		if (metadataType) {
			if (typeFlag === 'g') {
				applyGlobalPaxOverrides(globalPaxOverrides, readPaxOverrides(data));
			} else if (typeFlag === 'x') {
				for (const [key, value] of readPaxOverrides(data)) {
					pendingPaxOverrides.set(key, value);
				}
			} else {
				pendingPaxOverrides.set('path', readGnuLongName(data));
			}
			offset = dataStart + Math.ceil(size / 512) * 512;
			continue;
		}

		const type =
			typeFlag === '' || typeFlag === '0' ? 'file' : typeFlag === '5' ? 'directory' : 'link';
		const entry = { path: entryPath, type, size };
		// A caller-skipped entry is excluded before validation so a scoped read
		// (for example one pinned subdirectory of a whole-repository archive) is
		// not aborted by unsupported entry types it will never extract.
		if (skip(entryPath, entry)) {
			pendingPaxOverrides.clear();
			offset = dataStart + Math.ceil(size / 512) * 512;
			continue;
		}
		validateArchiveEntries([entry], limits);
		entries.push(entry);
		if (type === 'file' && select(entryPath, entry)) {
			files.set(entryPath, Buffer.from(data));
		}
		pendingPaxOverrides.clear();
		offset = dataStart + Math.ceil(size / 512) * 512;
	}

	validateArchiveEntries(entries, limits);
	return { entries, files };
}

async function readBoundedBody(response, maxBytes) {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error(`Remote response exceeds the ${maxBytes}-byte limit`);
	}
	if (!response.body) return Buffer.alloc(0);

	const chunks = [];
	let totalBytes = 0;
	for await (const chunk of response.body) {
		const bytes = Buffer.from(chunk);
		totalBytes += bytes.length;
		if (totalBytes > maxBytes) {
			if (typeof response.body.cancel === 'function') await response.body.cancel().catch(() => {});
			throw new Error(`Remote response exceeds the ${maxBytes}-byte limit`);
		}
		chunks.push(bytes);
	}
	return Buffer.concat(chunks, totalBytes);
}

export async function fetchBounded(
	initialUrl,
	{
		fetchImpl,
		allowedHosts,
		maxBytes,
		headers = {},
		redirects = REMOTE_LIMITS.redirects,
		requestTimeoutMs = REMOTE_LIMITS.requestTimeoutMs,
	},
) {
	let currentUrl = new URL(initialUrl);
	for (let redirectCount = 0; redirectCount <= redirects; redirectCount += 1) {
		if (currentUrl.protocol !== 'https:' || !allowedHosts.has(currentUrl.hostname)) {
			throw new Error(`Remote URL is outside the allowed HTTPS hosts: ${currentUrl.hostname}`);
		}
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(new Error(`Remote request timed out after ${requestTimeoutMs}ms`)),
			requestTimeoutMs,
		);
		try {
			const response = await fetchImpl(currentUrl, {
				method: 'GET',
				redirect: 'manual',
				signal: controller.signal,
				headers: {
					'user-agent': 'octane-react-port-preflight/1',
					...headers,
				},
			});
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				if (!location || redirectCount === redirects)
					throw new Error('Remote redirect limit exceeded');
				currentUrl = new URL(location, currentUrl);
				continue;
			}
			if (!response.ok) throw new Error(`Remote request failed with HTTP ${response.status}`);
			return {
				bytes: await readBoundedBody(response, maxBytes),
				finalUrl: currentUrl.toString(),
			};
		} finally {
			clearTimeout(timeout);
		}
	}
	throw new Error('Remote redirect limit exceeded');
}

export async function fetchJson(url, options) {
	const { bytes } = await fetchBounded(url, {
		...options,
		maxBytes: options.maxBytes ?? REMOTE_LIMITS.jsonBytes,
	});
	try {
		return JSON.parse(bytes.toString('utf8'));
	} catch {
		throw new Error('Remote response was not valid JSON');
	}
}

function normalizeRepository(repository) {
	const repositoryUrl = typeof repository === 'string' ? repository : repository?.url;
	if (typeof repositoryUrl !== 'string')
		throw new Error('Package metadata has no GitHub repository URL');
	let value = repositoryUrl.trim();
	if (value.startsWith('github:')) value = `https://github.com/${value.slice('github:'.length)}`;
	if (value.startsWith('git+')) value = value.slice(4);
	if (value.startsWith('git://github.com/'))
		value = `https://github.com/${value.slice('git://github.com/'.length)}`;
	if (value.startsWith('git@github.com:'))
		value = `https://github.com/${value.slice('git@github.com:'.length)}`;
	if (value.startsWith('ssh://git@github.com/')) {
		value = `https://github.com/${value.slice('ssh://git@github.com/'.length)}`;
	}
	const parsed = new URL(value);
	if (
		parsed.protocol !== 'https:' ||
		parsed.hostname !== 'github.com' ||
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error('Only public GitHub source repositories are supported');
	}
	const normalized = parseGitHubUrl(parsed);
	if (normalized.ref || normalized.subdirectory)
		throw new Error('Package repository metadata must identify the repository root');

	let subdirectory = typeof repository === 'object' ? (repository.directory ?? null) : null;
	if (subdirectory !== null) {
		if (typeof subdirectory !== 'string')
			throw new Error('Package repository.directory must be a string');
		const parts = subdirectory
			.split('/')
			.map((part) => decodePathPart(part, 'repository directory'));
		subdirectory = parts.join('/');
	}
	return { owner: normalized.owner, repo: normalized.repo, subdirectory };
}

function parseJsonFile(bytes, label) {
	try {
		return JSON.parse(bytes.toString('utf8'));
	} catch {
		throw new Error(`${label} is not valid JSON`);
	}
}

function archiveEvidencePath(relativePath) {
	return `package/${relativePath.replace(/^\.\//, '')}`;
}

function isStandardEvidencePath(entryPath) {
	if (!entryPath.startsWith('package/')) return false;
	const relativePath = entryPath.slice('package/'.length);
	return (
		!relativePath.includes('/') &&
		(LICENSE_NAME_PATTERN.test(relativePath) || NOTICE_NAME_PATTERN.test(relativePath))
	);
}

function isScannableSourcePath(entryPath) {
	if (!entryPath.startsWith('package/') || !SOURCE_FILE_PATTERN.test(entryPath)) return false;
	if (/\.d\.[cm]?ts$/i.test(entryPath)) return false;
	const parts = entryPath.slice('package/'.length).split('/');
	return !parts.some((part) => SOURCE_SKIP_PARTS.has(part.toLowerCase()));
}

export function conventionalTestPath(relativePath) {
	const segments = relativePath.toLowerCase().split('/');
	const baseName = segments.at(-1);
	if (
		segments.some((segment) => ['fixture', 'fixtures', '__fixtures__'].includes(segment)) ||
		/(?:^|[.-])fixture\.[cm]?[jt]sx?$/.test(baseName)
	) {
		return false;
	}
	return (
		segments.some((segment) =>
			['test', 'tests', '__tests__', 'typetests', 'type-tests', 'test-d'].includes(segment),
		) || /(?:^|[.-])(?:test|spec|test-d|d-test)\.(?:[cm]?[jt]sx?|coffee)$/.test(baseName)
	);
}

function expandBracePattern(pattern) {
	const expanded = [pattern];
	for (let index = 0; index < expanded.length; index++) {
		const current = expanded[index];
		const open = current.indexOf('{');
		if (open === -1) continue;
		const close = current.indexOf('}', open + 1);
		if (close === -1) return [pattern];
		const choices = current.slice(open + 1, close).split(',');
		if (choices.length < 2 || choices.length > 16) return [pattern];
		const variants = choices.map(
			(choice) => `${current.slice(0, open)}${choice}${current.slice(close + 1)}`,
		);
		if (expanded.length - 1 + variants.length > 64) return [pattern];
		expanded.splice(index, 1, ...variants);
		index--;
	}
	return expanded;
}

function globMatchesPath(relativePath, pattern) {
	let expression = '^';
	for (let index = 0; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === '*' && pattern[index + 1] === '*') {
			if (pattern[index + 2] === '/') {
				expression += '(?:.*/)?';
				index += 2;
			} else {
				expression += '.*';
				index++;
			}
		} else if (character === '*') {
			expression += '[^/]*';
		} else if (character === '?') {
			expression += '[^/]';
		} else {
			expression += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
		}
	}
	return new RegExp(`${expression}$`).test(relativePath);
}

function normalizeConfigurationPattern(value) {
	const candidate = value.replace(/^--[^=]+=|^[([{,'"]+|[\]),;'"`]+$/g, '').replace(/^\.\//, '');
	if (!candidate || /\s/.test(candidate) || candidate.startsWith('!')) return null;
	return candidate.includes('/') || TEST_SOURCE_PATTERN.test(candidate) ? candidate : null;
}

function commandPathPatterns(testScripts) {
	return Object.values(testScripts).flatMap((command) =>
		String(command).split(/\s+/).map(normalizeConfigurationPattern).filter(Boolean),
	);
}

function propertyName(name) {
	return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null;
}

function staticConfigurationPatterns(node) {
	if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		const pattern = normalizeConfigurationPattern(node.text);
		return pattern ? [pattern] : [];
	}
	if (ts.isArrayLiteralExpression(node)) {
		return node.elements.flatMap((element) =>
			ts.isSpreadElement(element) ? [] : staticConfigurationPatterns(element),
		);
	}
	return [];
}

function configurationSectionName(node) {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (ts.isPropertyAssignment(parent)) {
			return propertyName(parent.name);
		}
	}
	return null;
}

function configurationPathSelections(configurationSource, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		configurationSource,
		ts.ScriptTarget.Latest,
		true,
	);
	const testFiles = [];
	const inlineSources = [];
	const visit = (node) => {
		if (ts.isPropertyAssignment(node)) {
			const name = propertyName(node.name);
			const section = configurationSectionName(node);
			const withinTestConfiguration = ['test', 'vitest', 'jest', 'ava', 'mocha'].includes(section);
			if (name === 'includeSource' && withinTestConfiguration) {
				inlineSources.push(...staticConfigurationPatterns(node.initializer));
			} else if (
				name === 'testMatch' ||
				name === 'spec' ||
				(name === 'include' && withinTestConfiguration) ||
				(name === 'files' && withinTestConfiguration)
			) {
				testFiles.push(...staticConfigurationPatterns(node.initializer));
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return { inlineSources, testFiles };
}

function referencedByTestConfiguration(relativePath, configurationPatterns) {
	const normalized = relativePath.replace(/^\.\//, '');
	return configurationPatterns.some((pattern) =>
		expandBracePattern(pattern).some((expanded) =>
			/[*?]/.test(expanded) ? globMatchesPath(normalized, expanded) : expanded === normalized,
		),
	);
}

function containsInlineTestMarker(source, fileName) {
	const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
	let found = false;
	const visit = (node) => {
		if (
			ts.isPropertyAccessExpression(node) &&
			node.name.text === 'vitest' &&
			ts.isMetaProperty(node.expression) &&
			node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
			node.expression.name.text === 'meta'
		) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
}

async function immutableTestInventory(tree, subdirectory, manifest, options) {
	const scopePrefix = subdirectory ? `${subdirectory}/` : '';
	const testScripts = Object.fromEntries(
		Object.entries(manifest.scripts ?? {}).filter(([name]) => /(?:test|spec|type)/i.test(name)),
	);
	const manifestRunnerConfiguration = Object.fromEntries(
		['jest', 'vitest', 'ava', 'mocha'].flatMap((name) =>
			manifest[name] === undefined ? [] : [[name, manifest[name]]],
		),
	);
	const initialConfigurationSource = JSON.stringify({
		scripts: testScripts,
		...manifestRunnerConfiguration,
	});
	const explicitConfigurationPaths = [
		...initialConfigurationSource.matchAll(/--config(?:=|\s+)([^\s"']+)/g),
	].map((match) => match[1].replace(/^\.\//, ''));
	const configurationEntries = tree.filter((entry) => {
		if (!isGitHubRegularBlob(entry)) return false;
		const directory = path.posix.dirname(entry.path);
		const conventionalConfiguration =
			(directory === '.' || directory === (subdirectory ?? '.')) &&
			TEST_CONFIG_PATTERN.test(path.posix.basename(entry.path));
		const relativePath = entry.path.startsWith(scopePrefix)
			? entry.path.slice(scopePrefix.length)
			: null;
		return (
			conventionalConfiguration ||
			(relativePath !== null && explicitConfigurationPaths.includes(relativePath))
		);
	});
	const manifestSelections = configurationPathSelections(
		JSON.stringify(manifestRunnerConfiguration),
		'package-runner-config.json',
	);
	const configurationPatterns = new Set([
		...commandPathPatterns(testScripts),
		...manifestSelections.testFiles,
	]);
	const inlineSourcePatterns = new Set(manifestSelections.inlineSources);
	for (const entry of configurationEntries) {
		const source = (await fetchGitHubBlob(entry, options)).toString('utf8');
		const selections = configurationPathSelections(source, entry.path);
		for (const pattern of selections.testFiles) {
			configurationPatterns.add(pattern);
		}
		for (const pattern of selections.inlineSources) inlineSourcePatterns.add(pattern);
	}
	const configuredTestPatterns = [...configurationPatterns];
	const configuredInlineSourcePatterns = [...inlineSourcePatterns];
	const configurationEntryPaths = new Set(configurationEntries.map((entry) => entry.path));
	const candidateEntries = tree.flatMap((entry) => {
		if (!isGitHubRegularBlob(entry) || !entry.path.startsWith(scopePrefix)) return [];
		if (configurationEntryPaths.has(entry.path)) return [];
		const relativePath = entry.path.slice(scopePrefix.length);
		if (!TEST_SOURCE_PATTERN.test(relativePath) || /(?:^|\/)node_modules\//i.test(relativePath)) {
			return [];
		}
		const directTest =
			conventionalTestPath(relativePath) ||
			referencedByTestConfiguration(relativePath, configuredTestPatterns);
		const inlineSource = referencedByTestConfiguration(
			relativePath,
			configuredInlineSourcePatterns,
		);
		return directTest || inlineSource ? [{ directTest, entry, inlineSource, relativePath }] : [];
	});
	if (candidateEntries.length > MAX_UPSTREAM_TEST_FILES) {
		throw new Error('Immutable upstream test inventory exceeds the file limit');
	}
	if (
		candidateEntries.reduce((total, { entry }) => total + (entry.size ?? 0), 0) >
		MAX_UPSTREAM_TEST_BYTES
	) {
		throw new Error('Immutable upstream test inventory exceeds the byte limit');
	}
	const candidateSources = new Map();
	const candidates = [];
	for (const candidate of candidateEntries) {
		if (!candidate.directTest && candidate.inlineSource) {
			const source = (await fetchGitHubBlob(candidate.entry, options)).toString('utf8');
			if (!containsInlineTestMarker(source, candidate.entry.path)) continue;
			candidateSources.set(candidate.entry.path, source);
		}
		candidates.push(candidate);
	}
	const inventory = [];
	for (const { entry, relativePath } of candidates.sort((left, right) =>
		left.entry.path.localeCompare(right.entry.path),
	)) {
		const source =
			candidateSources.get(entry.path) ?? (await fetchGitHubBlob(entry, options)).toString('utf8');
		const possibleRegistrars = findPossibleUnexpandedRegistrars(source);
		if (possibleRegistrars.length > 0) {
			throw new Error(
				`Immutable upstream test ${entry.path} has unexpanded registrar(s): ${possibleRegistrars
					.map((registrar) => registrar.name)
					.join(', ')}`,
			);
		}
		const testCases = extractTestCases(source, { file: entry.path });
		if (testCases.length === 0) {
			throw new Error(`Immutable upstream test ${entry.path} has no countable registrations`);
		}
		const registrations = testCases.flatMap((testCase) => {
			if (
				!Number.isSafeInteger(testCase.estimatedRegistrations) ||
				testCase.estimatedRegistrations < 1
			) {
				throw new Error(
					`Immutable upstream test ${entry.path} cannot count every registration for ${testCase.caseId}`,
				);
			}
			return Array.from({ length: testCase.estimatedRegistrations }, (_, registrationIndex) => {
				const id =
					testCase.estimatedRegistrations === 1
						? testCase.caseId
						: `react-registration-v1:${createHash('sha256')
								.update(`${testCase.caseId}\0${registrationIndex}`)
								.digest('hex')
								.slice(0, 20)}`;
				return {
					id,
					declarationId: testCase.declarationId,
					source: `${entry.path}:${testCase.line}:${testCase.column}${
						testCase.estimatedRegistrations === 1 ? '' : `:registration:${registrationIndex}`
					}`,
					kind: testCase.kind,
					title: testCase.title ?? testCase.declaredTitle ?? testCase.titleExpression,
					estimatedRegistrations: testCase.estimatedRegistrations,
					registrationIndex,
					dynamicExpansion: testCase.dynamicExpansion,
					helperExpansion: testCase.helperExpansion,
					manualReviewReason: testCase.manualReviewReason,
				};
			});
		});
		inventory.push({
			path: entry.path,
			kind: /(?:^|\/)(?:typetests|type-tests|test-d)(?:\/|$)|(?:^|[.-])(?:test-d|d-test)\.[cm]?[jt]sx?$/i.test(
				relativePath,
			)
				? 'type'
				: 'runtime',
			gitBlob: entry.sha,
			size: entry.size ?? 0,
			registrations,
		});
	}
	return inventory;
}

function collectModuleSpecifiers(sourceFiles) {
	const imports = new Set();
	for (const [entryPath, bytes] of sourceFiles) {
		const sourceFile = ts.createSourceFile(
			entryPath,
			bytes.toString('utf8'),
			ts.ScriptTarget.Latest,
			false,
		);
		function visit(node) {
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteralLike(node.moduleSpecifier)
			) {
				imports.add(node.moduleSpecifier.text);
			} else if (
				ts.isImportEqualsDeclaration(node) &&
				ts.isExternalModuleReference(node.moduleReference) &&
				node.moduleReference.expression &&
				ts.isStringLiteralLike(node.moduleReference.expression)
			) {
				imports.add(node.moduleReference.expression.text);
			} else if (
				ts.isCallExpression(node) &&
				node.arguments.length === 1 &&
				ts.isStringLiteralLike(node.arguments[0]) &&
				(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
					(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
			) {
				imports.add(node.arguments[0].text);
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
	}
	return [...imports].sort();
}

function scanFeasibilityHazards(source) {
	const hazards = [];
	if (/\b(?:from\s*|require\s*\()['"]react-reconciler(?:\/[^'"]*)?['"]/.test(source)) {
		hazards.push('Uses react-reconciler or a custom renderer boundary.');
	}
	if (/\b(?:__SECRET_INTERNALS|__CLIENT_INTERNALS|ReactSharedInternals)\b/.test(source)) {
		hazards.push('Uses React private internals.');
	}
	if (/['"]react\/(?!jsx(?:-dev)?-runtime['"])[^'"]+['"]/.test(source)) {
		hazards.push('Imports a non-public or unclassified React subpath.');
	}
	return hazards;
}

export function collectArchiveEvidence(archiveBytes) {
	const uncompressed = gunzipSync(archiveBytes, {
		maxOutputLength: REMOTE_LIMITS.expandedArtifactBytes,
	});
	let parsed = parseTarArchive(uncompressed, {
		select: (entryPath, entry) =>
			entry.size <= REMOTE_LIMITS.licenseBytes &&
			(entryPath === 'package/package.json' || isStandardEvidencePath(entryPath)),
	});
	const manifestBytes = parsed.files.get('package/package.json');
	if (!manifestBytes) throw new Error('Published artifact has no package/package.json');
	const manifest = parseJsonFile(manifestBytes, 'Published package manifest');
	const reference = /^SEE LICENSE IN (.+)$/i.exec(manifest.license ?? '')?.[1];
	if (reference) {
		const referencePath = archiveEvidencePath(reference);
		if (!parsed.files.has(referencePath)) {
			parsed = parseTarArchive(uncompressed, {
				select: (entryPath, entry) =>
					entry.size <= REMOTE_LIMITS.licenseBytes &&
					(entryPath === 'package/package.json' ||
						isStandardEvidencePath(entryPath) ||
						entryPath === referencePath),
			});
		}
	}

	const licenseFiles = [];
	const noticeFiles = [];
	for (const [entryPath, bytes] of parsed.files) {
		if (entryPath === 'package/package.json') continue;
		const file = { path: entryPath, scope: 'package', content: bytes.toString('utf8') };
		if (NOTICE_NAME_PATTERN.test(path.posix.basename(entryPath))) noticeFiles.push(file);
		else licenseFiles.push(file);
	}

	let sourceFileCount = 0;
	let sourceBytes = 0;
	let sourceTruncated = false;
	const sourceFiles = parseTarArchive(uncompressed, {
		select: (entryPath, entry) => {
			if (!isScannableSourcePath(entryPath)) return false;
			if (
				entry.size > REMOTE_LIMITS.licenseBytes ||
				sourceFileCount >= MAX_SOURCE_FILES ||
				sourceBytes + entry.size > MAX_SOURCE_BYTES
			) {
				sourceTruncated = true;
				return false;
			}
			sourceFileCount += 1;
			sourceBytes += entry.size;
			return true;
		},
	}).files;
	const source = [...sourceFiles.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([entryPath, bytes]) => `/* ${entryPath} */\n${bytes.toString('utf8')}`)
		.join('\n');
	const sourceAnalysis = {
		...bridgeReportFromSource(source, { packageName: manifest.name }),
		filesScanned: sourceFiles.size,
		truncated: sourceTruncated,
		hazards: scanFeasibilityHazards(source),
		imports: collectModuleSpecifiers(sourceFiles),
	};
	return { manifest, manifestBytes, licenseFiles, noticeFiles, sourceAnalysis };
}

function mergeRuntimeDependencies(manifest) {
	const dependencies = {
		...(manifest.peerDependencies ?? {}),
		...(manifest.optionalDependencies ?? {}),
		...(manifest.dependencies ?? {}),
	};
	return Object.fromEntries(
		Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
	);
}

async function resolveRegistryArtifact(packageName, selector, options) {
	const registryHeaders = { accept: 'application/vnd.npm.install-v1+json' };
	if (options.npmToken) registryHeaders.authorization = `Bearer ${options.npmToken}`;
	const packumentUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
	const packument = await fetchJson(packumentUrl, {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['registry.npmjs.org']),
		headers: registryHeaders,
		requestTimeoutMs: options.requestTimeoutMs,
	});
	const requestedSelector = selector ?? 'latest';
	const exactVersion = packument.versions?.[requestedSelector]
		? requestedSelector
		: (packument['dist-tags']?.[requestedSelector] ??
			selectHighestSatisfyingVersion(Object.keys(packument.versions ?? {}), requestedSelector));
	if (!exactVersion || !packument.versions?.[exactVersion]) {
		throw new Error(`Selector ${requestedSelector} did not resolve to one exact published version`);
	}
	const compactMetadata = packument.versions[exactVersion];
	if (compactMetadata.name !== packageName || compactMetadata.version !== exactVersion) {
		throw new Error('Registry package identity contradicts the requested package');
	}
	if (!compactMetadata.dist?.tarball || !compactMetadata.dist?.integrity) {
		throw new Error('Registry metadata lacks tarball integrity evidence');
	}
	const metadata = await fetchJson(`${packumentUrl}/${encodeURIComponent(exactVersion)}`, {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['registry.npmjs.org']),
		headers: { ...registryHeaders, accept: 'application/json' },
		requestTimeoutMs: options.requestTimeoutMs,
	});
	if (metadata.name !== packageName || metadata.version !== exactVersion) {
		throw new Error('Exact-version registry metadata contradicts the requested package');
	}
	if (
		metadata.dist?.tarball !== compactMetadata.dist.tarball ||
		metadata.dist?.integrity !== compactMetadata.dist.integrity
	) {
		throw new Error('Exact-version registry metadata contradicts packument artifact evidence');
	}
	const artifact = await fetchBounded(metadata.dist.tarball, {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['registry.npmjs.org']),
		maxBytes: REMOTE_LIMITS.artifactBytes,
		headers: registryHeaders,
		requestTimeoutMs: options.requestTimeoutMs,
	});
	verifyIntegrity(artifact.bytes, metadata.dist.integrity);
	const contents = collectArchiveEvidence(artifact.bytes);
	if (contents.manifest.name !== metadata.name || contents.manifest.version !== metadata.version) {
		throw new Error('Published artifact identity contradicts registry metadata');
	}
	const metadataRepository = normalizeRepository(metadata.repository);
	const artifactRepository = normalizeRepository(contents.manifest.repository);
	if (!sameRepository(metadataRepository, artifactRepository)) {
		throw new Error('Published artifact repository metadata contradicts registry metadata');
	}
	if (metadata.license !== contents.manifest.license) {
		throw new Error('Published artifact license metadata contradicts registry metadata');
	}

	return {
		name: contents.manifest.name,
		version: contents.manifest.version,
		repository: metadataRepository,
		gitHead: metadata.gitHead,
		integrity: metadata.dist.integrity,
		manifestLicense: contents.manifest.license,
		licenseFiles: contents.licenseFiles,
		noticeFiles: contents.noticeFiles,
		manifestSha256: sha256(contents.manifestBytes),
		artifactUrl: artifact.finalUrl,
		runtimeDependencies: mergeRuntimeDependencies(contents.manifest),
		sourceAnalysis: contents.sourceAnalysis,
	};
}

export function githubHeaders(options) {
	const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
	if (options.githubToken) headers.authorization = `Bearer ${options.githubToken}`;
	return headers;
}

async function fetchGitHubBlob(entry, options) {
	if (entry.size > REMOTE_LIMITS.licenseBytes)
		throw new Error(`Source evidence file is too large: ${entry.path}`);
	const response = await fetchJson(entry.url, {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['api.github.com']),
		maxBytes: Math.min(REMOTE_LIMITS.jsonBytes, REMOTE_LIMITS.licenseBytes * 2),
		headers: githubHeaders(options),
		requestTimeoutMs: options.requestTimeoutMs,
	});
	if (response.encoding !== 'base64' || typeof response.content !== 'string') {
		throw new Error(`GitHub blob is not inline base64 evidence: ${entry.path}`);
	}
	const bytes = Buffer.from(response.content.replace(/\s/g, ''), 'base64');
	if (
		bytes.length !== entry.size ||
		(response.size !== undefined && response.size !== bytes.length)
	) {
		throw new Error(`GitHub blob size does not match tree evidence: ${entry.path}`);
	}
	const gitBlobSha = createHash('sha1')
		.update(`blob ${bytes.length}\0`)
		.update(bytes)
		.digest('hex');
	if (entry.sha?.toLowerCase() !== gitBlobSha) {
		throw new Error(`GitHub blob bytes do not match tree evidence: ${entry.path}`);
	}
	return bytes;
}

function applicableSourceEvidence(entryPath, subdirectory) {
	const directory = path.posix.dirname(entryPath);
	const basename = path.posix.basename(entryPath);
	return (
		(directory === '.' || directory === (subdirectory ?? '.')) &&
		(LICENSE_NAME_PATTERN.test(basename) || NOTICE_NAME_PATTERN.test(basename))
	);
}

function isGitHubRegularBlob(entry) {
	return entry.type === 'blob' && entry.mode !== '120000';
}

async function resolveGitHubSource(repository, ref, options) {
	const apiRoot = `https://api.github.com/repos/${repository.owner}/${repository.repo}`;
	const commitResponse = await fetchJson(
		`${apiRoot}/commits/${encodeURIComponent(ref ?? 'HEAD')}`,
		{
			fetchImpl: options.fetchImpl,
			allowedHosts: new Set(['api.github.com']),
			headers: githubHeaders(options),
			requestTimeoutMs: options.requestTimeoutMs,
		},
	);
	if (!/^[0-9a-f]{40}$/i.test(commitResponse.sha ?? ''))
		throw new Error('GitHub did not resolve an immutable commit');
	const commit = commitResponse.sha.toLowerCase();
	const treeSha = commitResponse.commit?.tree?.sha?.toLowerCase();
	if (!/^[0-9a-f]{40}$/i.test(treeSha ?? ''))
		throw new Error('GitHub commit has no immutable root tree');
	const treeResponse = await fetchJson(`${apiRoot}/git/trees/${treeSha}?recursive=1`, {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['api.github.com']),
		maxBytes: REMOTE_LIMITS.jsonBytes,
		headers: githubHeaders(options),
		requestTimeoutMs: options.requestTimeoutMs,
	});
	if (treeResponse.truncated) throw new Error('GitHub returned truncated source-tree evidence');
	if (treeResponse.sha?.toLowerCase() !== treeSha || !Array.isArray(treeResponse.tree)) {
		throw new Error('GitHub source tree does not match the resolved commit');
	}
	if (treeResponse.tree.length > 50_000)
		throw new Error('GitHub source tree exceeds the entry limit');
	const sourceEntries = treeResponse.tree
		.filter((entry) => entry.type === 'tree' || isGitHubRegularBlob(entry))
		.map((entry) => ({
			path: entry.path,
			type: entry.type === 'tree' ? 'directory' : 'file',
			size: entry.size ?? 0,
		}));
	validateArchiveEntries(sourceEntries, { maxFiles: 50_000 });

	const manifestPath = repository.subdirectory
		? `${repository.subdirectory}/package.json`
		: 'package.json';
	const manifestEntry = treeResponse.tree.find(
		(entry) => entry.path === manifestPath && isGitHubRegularBlob(entry),
	);
	if (!manifestEntry) throw new Error(`Immutable source has no ${manifestPath}`);
	const manifestBytes = await fetchGitHubBlob(manifestEntry, options);
	const manifest = parseJsonFile(manifestBytes, 'Immutable source manifest');
	if (manifest.repository) {
		const sourceManifestRepository = normalizeRepository(manifest.repository);
		if (!sameRepository(repository, sourceManifestRepository)) {
			throw new Error('Immutable source manifest repository contradicts the requested repository');
		}
	}

	const candidates = treeResponse.tree.filter(
		(entry) =>
			isGitHubRegularBlob(entry) && applicableSourceEvidence(entry.path, repository.subdirectory),
	);
	const reference = /^SEE LICENSE IN (.+)$/i.exec(manifest.license ?? '')?.[1];
	if (reference) {
		const referencePath = path.posix.normalize(
			repository.subdirectory ? `${repository.subdirectory}/${reference}` : reference,
		);
		if (referencePath.startsWith('../') || path.posix.isAbsolute(referencePath)) {
			throw new Error('Immutable source manifest references a license outside the repository');
		}
		const referencedEntry = treeResponse.tree.find(
			(entry) => entry.path === referencePath && isGitHubRegularBlob(entry),
		);
		if (referencedEntry && !candidates.includes(referencedEntry)) candidates.push(referencedEntry);
	}

	const licenseFiles = [];
	const noticeFiles = [];
	for (const entry of candidates.sort((left, right) => left.path.localeCompare(right.path))) {
		const bytes = await fetchGitHubBlob(entry, options);
		const file = {
			path: entry.path,
			scope:
				path.posix.dirname(entry.path) === (repository.subdirectory ?? '.') ? 'package' : 'root',
			content: bytes.toString('utf8'),
			gitBlob: entry.sha,
		};
		if (NOTICE_NAME_PATTERN.test(path.posix.basename(entry.path))) noticeFiles.push(file);
		else licenseFiles.push(file);
	}
	const upstreamTestInventory = await immutableTestInventory(
		treeResponse.tree,
		repository.subdirectory,
		manifest,
		options,
	);

	return {
		name: manifest.name,
		version: manifest.version,
		repository,
		commit,
		manifestLicense: manifest.license,
		licenseFiles,
		noticeFiles,
		manifestSha256: sha256(manifestBytes),
		upstreamTestInventory,
	};
}

export async function resolveRemoteInput(parsedInput, rawInput, options = {}) {
	const resolvedOptions = { fetchImpl: globalThis.fetch, ...options };
	if (typeof resolvedOptions.fetchImpl !== 'function')
		throw new Error('No fetch implementation is available');

	let registry;
	let source;
	if (parsedInput.kind === 'npm') {
		registry = await resolveRegistryArtifact(
			parsedInput.packageName,
			parsedInput.selector,
			resolvedOptions,
		);
		source = await resolveGitHubSource(registry.repository, registry.gitHead, resolvedOptions);
	} else {
		const repository = {
			owner: parsedInput.owner,
			repo: parsedInput.repo,
			subdirectory: parsedInput.subdirectory,
		};
		source = await resolveGitHubSource(repository, parsedInput.ref, resolvedOptions);
		if (!source.name || !source.version) {
			throw new Error('GitHub source package is not an exact published package identity');
		}
		registry = await resolveRegistryArtifact(source.name, source.version, resolvedOptions);
	}
	const result = assessResolvedEvidence({ input: rawInput, registry, source });
	const upstreamTestInventory = source.upstreamTestInventory ?? [];
	return {
		...result,
		upstreamTestInventory,
		evidenceFingerprint: fingerprint({
			preflight: result.evidenceFingerprint,
			upstreamTestInventory,
		}),
		runtimeDependencies: registry.runtimeDependencies,
		sourceAnalysis: registry.sourceAnalysis,
		provenance: sanitizeForReport({
			registryManifestSha256: registry.manifestSha256,
			sourceManifestSha256: source.manifestSha256,
			artifactUrl: registry.artifactUrl,
		}),
	};
}

export async function runPreflight({ inputs, resolve, onReady = async () => {} }) {
	if (!Array.isArray(inputs) || inputs.length === 0)
		throw new Error('At least one package input is required');
	if (typeof resolve !== 'function') throw new TypeError('A preflight resolver is required');

	const targets = [];
	for (const input of inputs) {
		try {
			const parsedInput = parseInput(input);
			const result = sanitizeForReport(await resolve(parsedInput, input));
			targets.push({ input, ...result });
			if (result.status === 'licensed') await onReady(result);
		} catch (error) {
			targets.push({
				input,
				status: 'blocked',
				blockers: [sanitizeForReport(error instanceof Error ? error.message : String(error))],
				repair: 'Correct the input or retry after supplying the missing immutable evidence.',
			});
		}
	}

	const blocked = targets.filter((target) => target.status === 'blocked').length;
	return {
		schemaVersion: 1,
		status: blocked === targets.length ? 'blocked' : blocked > 0 ? 'partial' : 'passed',
		targets,
	};
}
