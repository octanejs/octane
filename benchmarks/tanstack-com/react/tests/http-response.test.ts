import assert from 'node:assert/strict';
import { getContentDispositionHeader, sanitizeResponseFilename } from '../src/utils/http-response';

assert.equal(
	sanitizeResponseFilename('../docs/quick start.md'),
	'docs-quick-start.md',
	'path separators and spaces are normalized for response filenames',
);

assert.equal(
	sanitizeResponseFilename('\r\n"bad".zip', 'fallback.zip'),
	'bad.zip',
	'control characters and quotes are stripped from response filenames',
);

assert.equal(
	sanitizeResponseFilename('../', 'fallback.zip'),
	'fallback.zip',
	'empty sanitized filenames fall back to the provided filename',
);

assert.equal(
	getContentDispositionHeader('attachment', 'my app.zip'),
	'attachment; filename="my-app.zip"; filename*=UTF-8\'\'my-app.zip',
	'content disposition uses a sanitized quoted filename and RFC 5987 filename',
);

console.log('http-response tests passed');
