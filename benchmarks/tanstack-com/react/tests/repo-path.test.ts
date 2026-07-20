import assert from 'node:assert/strict';
import { isValidRepoPath, joinRepoPath } from '../src/utils/repo-path';
import { getExampleStartingPath } from '../src/utils/sandbox';

assert.equal(
	isValidRepoPath('examples/react/start-clerk-basic/src/routes/_authed/posts.$postId.tsx'),
	true,
	'TanStack route params are valid repo path segments',
);

assert.equal(
	isValidRepoPath('examples/react/start-clerk-basic/src/routes/__root.tsx'),
	true,
	'underscores remain valid repo path segments',
);

assert.equal(isValidRepoPath('../src/routes/__root.tsx'), false, 'traversal is rejected');

assert.equal(isValidRepoPath('src/routes//__root.tsx'), false, 'empty path segments are rejected');

assert.equal(isValidRepoPath('src/routes/app?file.tsx'), false, 'query delimiters are rejected');

assert.equal(
	joinRepoPath('examples/react/start-basic', 'src/routes/__root.tsx'),
	'examples/react/start-basic/src/routes/__root.tsx',
	'relative example paths are resolved under the example directory',
);

assert.equal(
	joinRepoPath('examples/react/start-basic', 'examples/react/start-basic/src/routes/__root.tsx'),
	'examples/react/start-basic/src/routes/__root.tsx',
	'repo-root example paths are not prefixed twice',
);

assert.equal(
	getExampleStartingPath('react', 'start'),
	'src/routes/__root.tsx',
	'Start examples default to the root route file',
);

assert.equal(
	getExampleStartingPath('react', 'router'),
	'src/main.tsx',
	'Router examples default to main.tsx when directory contents are unavailable',
);

console.log('repo-path tests passed');
