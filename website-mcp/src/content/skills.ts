// The bundled agent skills from @octanejs/mcp-server, inlined at build time —
// the deployed function has no package filesystem to read them from.
const rawSkills = import.meta.glob('../../../packages/octane-mcp-server/skills/*.md', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

export const SKILLS: Readonly<Record<string, string>> = Object.fromEntries(
	Object.entries(rawSkills).map(([path, markdown]) => [
		path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
		markdown,
	]),
);

export const SKILL_NAMES = Object.keys(SKILLS).sort() as [string, ...string[]];
