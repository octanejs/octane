// A generated-file listing, drawn as the directory tree it describes.
//
// Deliberately not a fenced code block. Every fence in the docs is mapped to
// `DocPre`, which wraps it in `CodeBlock` and hangs a copy button off it — an
// affordance that promises something to paste, which a list of files is not.
// This renders nested lists instead, so the nesting is real markup a screen
// reader can announce rather than indentation baked into a string.
//
// The public prop is a flat list of paths, which is the shape a generated
// manifest would arrive in.

export interface FileTreeEntry {
	/** Slash-separated path, relative to the project root. */
	path: string;
	/** What the file is for, shown beside the leaf it belongs to. */
	note?: string;
}

interface FileTreeProps {
	entries: readonly FileTreeEntry[];
	/** Names the tree for assistive technology. */
	label: string;
}

interface TreeNode {
	name: string;
	/** Full path, unique across the tree, so it keys the rendered list. */
	path: string;
	note?: string;
	children: TreeNode[];
}

/**
 * Fold a flat path list into a tree, preserving the order the paths arrive in
 * rather than sorting: the caller lists a project the way it reads, root files
 * before `src/`, and that order is information.
 */
function buildTree(entries: readonly FileTreeEntry[]): TreeNode[] {
	const roots: TreeNode[] = [];

	for (const entry of entries) {
		const segments = entry.path.split('/').filter((segment) => segment !== '');
		let level = roots;
		let prefix = '';

		segments.forEach((segment, index) => {
			prefix = prefix === '' ? segment : prefix + '/' + segment;
			let node = level.find((candidate) => candidate.name === segment);
			if (!node) {
				node = { name: segment, path: prefix, children: [] };
				level.push(node);
			}
			// Only the last segment is the file the note describes; the ones before
			// it are directories this path happens to pass through.
			if (index === segments.length - 1 && entry.note !== undefined) {
				node.note = entry.note;
			}
			level = node.children;
		});
	}

	return roots;
}

/**
 * One level of the tree, recursing through itself.
 *
 * It renders markup only. A `@{ … }` body ends with exactly one output node, so
 * this cannot carry a `<style>` beside its list — and a `<style>` *inside* a
 * `<ul>` is not valid markup either. The wrapper below owns the styling for
 * every depth instead, which is also why these class names are prefixed: they
 * are reached through `:global`, so they are not scoped for us.
 */
function FileTreeLevel(props: { nodes: readonly TreeNode[] }) @{
	<ul class="ft-level">
		@for (const node of props.nodes; key node.path) {
			<li class="ft-item">
				<span class="ft-row">
					<span class="ft-name">{node.name as string}</span>
					@if (node.note !== undefined) {
						<span class="ft-note">{node.note as string}</span>
					}
				</span>
				@if (node.children.length > 0) {
					<FileTreeLevel nodes={node.children} />
				}
			</li>
		}
	</ul>
}

export function FileTree(props: FileTreeProps) @{
	const nodes = buildTree(props.entries);

	<div class="file-tree" role="group" aria-label={props.label}>
		<FileTreeLevel nodes={nodes} />

		<style>
			/* The docs' panel treatment, minus the code-block header: there is no
			   language to label and nothing worth copying. */
			.file-tree {
				margin: 1.4rem 0;
				padding: 0.9rem 1.1rem;
				border: 1px solid var(--border);
				border-radius: 0.75rem;
				background: var(--surface-subtle);
				overflow-x: auto;
			}
			/* The list lives in a child component, so its markup carries that
			   component's scope rather than this one's. Descendant selectors reach
			   it through :global, anchored on .file-tree so nothing leaks. */
			.file-tree :global(.ft-level) {
				margin: 0;
				padding: 0;
				list-style: none;
			}
			/* Nested levels indent and carry the vertical run joining their
			   siblings; each item hangs a short horizontal tick off it. */
			.file-tree :global(.ft-level .ft-level) {
				margin-left: 0.75rem;
				padding-left: 0.75rem;
				border-left: 1px solid var(--border);
			}
			/* Only a nested item hangs a tick off its parent's vertical run. The
			   top level has no run to hang from — a tick there is a dash floating
			   in space, connected to nothing. */
			.file-tree :global(.ft-level .ft-level > .ft-item) {
				position: relative;
				padding-left: 1rem;
			}
			.file-tree :global(.ft-level .ft-level > .ft-item)::before {
				content: '';
				position: absolute;
				top: 0.75em;
				left: 0;
				width: 0.6rem;
				border-top: 1px solid var(--border);
			}
			.file-tree :global(.ft-row) {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: 0.4rem 1rem;
				padding: 0.1rem 0;
			}
			.file-tree :global(.ft-name) {
				font-family: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.85rem;
				color: var(--text);
			}
			.file-tree :global(.ft-note) {
				color: var(--text-secondary);
				font-size: 0.82rem;
				line-height: 1.4;
			}
		</style>
	</div>
}
