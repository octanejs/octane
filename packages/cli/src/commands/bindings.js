import { defineCommand } from '../kernel/command.js';
import { BINDINGS, searchBindings } from '../data/index.js';

export default defineCommand({
	description: 'List the @octanejs/* bindings, what they port, and how they differ from upstream.',
	positionals: [
		{ name: 'query', description: 'Filter by binding name, upstream package, or category.' },
	],
	flags: {
		divergences: { type: 'boolean', description: "Include each binding's known divergences." },
	},

	async run(ctx, input) {
		const query = input.positionals.join(' ');
		const matches = query ? searchBindings(query) : BINDINGS;

		ctx.ui.intro(query ? `octane bindings: ${query}` : 'octane bindings');

		if (matches.length === 0) {
			ctx.ui.outro(
				`Nothing matches "${query}". Run \`octane bindings\` to see all ${BINDINGS.length}.`,
			);
			return { json: { query, bindings: [] } };
		}

		const width = matches.reduce((max, binding) => Math.max(max, binding.name.length), 0);

		for (const category of [...new Set(matches.map((binding) => binding.category))]) {
			ctx.ui.log('');
			ctx.ui.log(ctx.ui.colors.bold(category));

			for (const binding of matches.filter((entry) => entry.category === category)) {
				const upstream = binding.upstream
					? `${binding.upstream.package}@${binding.upstream.version}`
					: 'no React upstream';
				ctx.ui.log(`  ${binding.name.padEnd(width)}  ${ctx.ui.colors.dim(upstream)}`);

				if (input.flags.divergences) {
					for (const divergence of binding.divergences) {
						ctx.ui.log(
							`      ${ctx.ui.colors.yellow('diverges:')} ${ctx.ui.colors.dim(divergence)}`,
						);
					}
				}
			}
		}

		ctx.ui.log('');
		ctx.ui.outro(
			`${matches.length} of ${BINDINGS.length} binding(s). \`octane add <package>\` installs one.`,
		);

		return { json: { query: query || null, bindings: matches } };
	},
});
