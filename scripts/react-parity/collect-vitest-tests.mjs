import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vitest list omits skip/todo registrations. Full-suite audit inventories need
// those identities too, so collect through the same runner without executing.
export async function collectVitestTests(root, project) {
	const { createVitest } = await import('vitest/node');
	const ctx = await createVitest(
		'test',
		{
			root,
			project: [project],
			watch: false,
			reporters: [],
			silent: true,
			maxWorkers: 4,
		},
		{ logLevel: 'error' },
		{ stdout: process.stderr, stderr: process.stderr },
	);
	try {
		const result = await ctx.collectTests(await ctx.globTestSpecifications());
		const errors = [
			...result.unhandledErrors,
			...result.testModules.flatMap((module) => module.errors()),
			...result.testModules.flatMap((module) =>
				[...module.children.allSuites()].flatMap((suite) => suite.errors()),
			),
		];
		if (errors.length)
			throw new Error(
				`Vitest collection failed: ${errors.map((error) => error.message).join('; ')}`,
			);
		return result.testModules.flatMap((module) =>
			[...module.children.allTests()].map((test) => ({
				file: module.moduleId,
				name: test.fullName,
				mode: test.task.mode,
			})),
		);
	} finally {
		await ctx.close();
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [root, project] = process.argv.slice(2);
	if (!root || !project) throw new Error('Supply a repository root and Vitest project');
	process.stdout.write(`${JSON.stringify(await collectVitestTests(resolve(root), project))}\n`);
}
