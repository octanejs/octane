import assert from 'node:assert/strict';
import { allMaintainers } from '../src/libraries/maintainers';
import { isPublicLibrary, libraries, publicLibraries } from '../src/libraries/libraries';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

assert.deepEqual(
	publicLibraries,
	libraries.filter(isPublicLibrary),
	'publicLibraries stays in sync with the public-library selector',
);

for (const library of publicLibraries) {
	assert.equal(
		library.to.startsWith('/'),
		true,
		`${library.id} public route must be an internal absolute path`,
	);
	assert.notEqual(library.visible, false, `${library.id} hidden library should not be public`);
}

for (const library of libraries) {
	if (!library.scarfId) {
		continue;
	}

	assert.match(library.scarfId, uuidPattern, `${library.id} scarfId must be a UUID`);
}

for (const maintainer of allMaintainers) {
	const socialEntries = Object.entries(maintainer.social ?? {});

	for (const [field, value] of socialEntries) {
		assert.match(
			value,
			/^https:\/\//,
			`${maintainer.github} ${field} URL must use an explicit https:// URL`,
		);
	}
}

console.log('static data contract tests passed');
