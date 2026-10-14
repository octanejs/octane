// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { loadOctaneConfig } from '@octanejs/app-core/config-loader';
// @ts-expect-error The JavaScript-only bundler API has no declarations.
import { createOctaneCompiler } from 'octane/compiler/bundler';
// @ts-expect-error The CLI's internal project detector has no declarations.
import { detectProject } from '../../packages/cli/src/kernel/project.js';
// @ts-expect-error The CLI's internal Strong policy loader has no declarations.
import { loadStrongPolicy } from '../../packages/cli/src/commands/analyze/strong-coverage.js';

it('enforces shared Strong config for website source without changing dependency policy', async () => {
	const root = fileURLToPath(new URL('../', import.meta.url));
	const config = await loadOctaneConfig(root);
	const { policy } = await loadStrongPolicy(detectProject(root), { required: true });
	expect(policy).not.toBeNull();
	if (!policy) throw new Error('Website Strong policy was not loaded');

	// No directive: only the real shared config can reject this render-time update.
	const source = `import { useState } from 'octane';
export function Counter() @{
	const [count, setCount] = useState(0);
	setCount(count + 1);
	<button>{count as number}</button>
}`;
	const application = fileURLToPath(new URL('../src/StrongPolicyProbe.tsrx', import.meta.url));
	const dependency = fileURLToPath(
		new URL('../../packages/radix/src/StrongPolicyProbe.tsrx', import.meta.url),
	);
	const compiler = createOctaneCompiler({ root, ...config.compiler });

	expect(policy.status(source, application)).toEqual({
		strong: true,
		directive: false,
		config: true,
	});
	expect(() => compiler.transform(source, application)).toThrow(
		/OCTANE_STRONG_RENDER_STATE_UPDATE|useLinkedState/,
	);
	expect(policy.status(source, dependency)).toEqual({
		strong: false,
		directive: false,
		config: false,
	});
	expect(compiler.transform(source, dependency)).not.toBeNull();
});
