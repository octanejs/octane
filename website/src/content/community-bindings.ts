// Community projects are reviewed editorial content. This module validates the
// checked-in source once and exposes that same ordered catalog to page and
// search consumers without importing it into first-party inventory semantics.
import communityBindingCatalog from './community-bindings.json';

export interface CommunityBindingEntry {
	id: string;
	name: string;
	purpose: string;
	owner: string;
	destination: string;
	searchNames: string[];
}

export interface CommunityBindingGroup {
	id: string;
	title: string;
	entries: CommunityBindingEntry[];
}

const GROUP_IDS = ['tanstack', 'community-libraries', 'tooling-and-platforms'] as const;

const GROUP_FIELDS = new Set(['id', 'title', 'entries']);
const ENTRY_FIELDS = new Set(['id', 'name', 'purpose', 'owner', 'destination', 'searchNames']);
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalid(path: string, message: string): never {
	throw new Error(`Invalid community binding catalog at ${path}: ${message}`);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		invalid(path, 'must be an object');
	}
	return value as Record<string, unknown>;
}

function rejectUnknownFields(
	record: Record<string, unknown>,
	allowed: ReadonlySet<string>,
	path: string,
): void {
	const unknownField = Object.keys(record).find((field) => !allowed.has(field));
	if (unknownField !== undefined) {
		invalid(`${path}.${unknownField}`, 'is not an allowed catalog field');
	}
}

function readString(record: Record<string, unknown>, field: string, path: string): string {
	const value = record[field];
	if (typeof value !== 'string' || value.trim() === '') {
		invalid(`${path}.${field}`, 'must be a non-empty string');
	}
	if (value !== value.trim()) {
		invalid(`${path}.${field}`, 'must not have leading or trailing whitespace');
	}
	return value;
}

function readStableId(record: Record<string, unknown>, path: string): string {
	const id = readString(record, 'id', path);
	if (!STABLE_ID.test(id)) {
		invalid(`${path}.id`, 'must be a lowercase, hyphen-separated stable ID');
	}
	return id;
}

function readDestination(record: Record<string, unknown>, path: string): string {
	const destination = readString(record, 'destination', path);
	let parsed: URL;
	try {
		parsed = new URL(destination);
	} catch {
		invalid(`${path}.destination`, 'must be a valid HTTPS URL');
	}
	if (
		parsed.protocol !== 'https:' ||
		!destination.startsWith('https://') ||
		parsed.hostname === ''
	) {
		invalid(`${path}.destination`, 'must be a valid HTTPS URL');
	}
	return destination;
}

function normalizeSearchName(value: string): string {
	return value.normalize('NFKC').trim().toLowerCase();
}

export function validateCommunityBindingCatalog(value: unknown): CommunityBindingGroup[] {
	if (!Array.isArray(value)) {
		invalid('catalog', 'must be an array');
	}
	if (value.length !== GROUP_IDS.length) {
		invalid('catalog', `must contain exactly ${GROUP_IDS.length} groups`);
	}

	const entryIds = new Map<string, string>();
	const searchNames = new Map<string, string>();

	return value.map((rawGroup, groupIndex) => {
		const groupPath = `groups[${groupIndex}]`;
		const group = readRecord(rawGroup, groupPath);
		rejectUnknownFields(group, GROUP_FIELDS, groupPath);

		const id = readStableId(group, groupPath);
		const title = readString(group, 'title', groupPath);
		const expectedId = GROUP_IDS[groupIndex];
		if (id !== expectedId) {
			invalid(`${groupPath}.id`, `must be the authored group "${expectedId}"`);
		}

		if (!Array.isArray(group.entries) || group.entries.length === 0) {
			invalid(`${groupPath}.entries`, 'must be a non-empty array');
		}

		const entries = group.entries.map((rawEntry, entryIndex) => {
			const entryPath = `${groupPath}.entries[${entryIndex}]`;
			const entry = readRecord(rawEntry, entryPath);
			rejectUnknownFields(entry, ENTRY_FIELDS, entryPath);

			const entryId = readStableId(entry, entryPath);
			const previousEntryPath = entryIds.get(entryId);
			if (previousEntryPath !== undefined) {
				invalid(
					`${entryPath}.id`,
					`duplicate entry id "${entryId}" (already used at ${previousEntryPath}.id)`,
				);
			}
			entryIds.set(entryId, entryPath);

			const name = readString(entry, 'name', entryPath);
			const purpose = readString(entry, 'purpose', entryPath);
			const owner = readString(entry, 'owner', entryPath);
			const destination = readDestination(entry, entryPath);

			if (!Array.isArray(entry.searchNames) || entry.searchNames.length === 0) {
				invalid(`${entryPath}.searchNames`, 'must be a non-empty array');
			}

			const validatedSearchNames = entry.searchNames.map((rawSearchName, searchNameIndex) => {
				const searchNamePath = `${entryPath}.searchNames[${searchNameIndex}]`;
				if (typeof rawSearchName !== 'string' || rawSearchName.trim() === '') {
					invalid(searchNamePath, 'must be a non-empty string');
				}
				if (rawSearchName !== rawSearchName.trim()) {
					invalid(searchNamePath, 'must not have leading or trailing whitespace');
				}

				const normalized = normalizeSearchName(rawSearchName);
				const previousSearchNamePath = searchNames.get(normalized);
				if (previousSearchNamePath !== undefined) {
					invalid(
						searchNamePath,
						`duplicate searchNames value "${rawSearchName}" normalized as "${normalized}" ` +
							`(already used at ${previousSearchNamePath})`,
					);
				}
				searchNames.set(normalized, searchNamePath);
				return rawSearchName;
			});

			return {
				id: entryId,
				name,
				purpose,
				owner,
				destination,
				searchNames: validatedSearchNames,
			};
		});

		return { id, title, entries };
	});
}

export const COMMUNITY_BINDING_GROUPS = validateCommunityBindingCatalog(communityBindingCatalog);
