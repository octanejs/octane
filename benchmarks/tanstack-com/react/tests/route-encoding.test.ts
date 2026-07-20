import assert from 'node:assert/strict';
import {
	decodePackageNameSlug,
	encodePackageNameSlug,
	getRowFieldId,
} from '../src/utils/route-encoding';

const packageNames = [
	'@tanstack/react-query',
	'tanstack__intent',
	'@scope/name_with_underscores',
	'plain-package',
];

for (const packageName of packageNames) {
	assert.equal(
		decodePackageNameSlug(encodePackageNameSlug(packageName)),
		packageName,
		`${packageName} package route slug round-trips`,
	);
}

assert.equal(
	decodePackageNameSlug(encodeURIComponent(encodePackageNameSlug('@scope/pkg'))),
	'@scope/pkg',
	'double-encoded package route slugs decode for router/browser compatibility',
);

assert.equal(
	getRowFieldId('moderation-note', '@scope/pkg', 'note'),
	'moderation-note-scope-pkg-note',
	'row-local ids normalize unsafe id characters',
);

assert.equal(
	getRowFieldId('moderation-note', '', 'note'),
	'moderation-note-item-note',
	'row-local ids use stable fallback segments',
);

console.log('route-encoding tests passed');
