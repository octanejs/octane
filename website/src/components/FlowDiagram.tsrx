// Diagrams for the docs, drawn from data rather than images.
//
// A diagram is written inline in the MDX as plain props, so the raw page an
// agent reads through llms-full.txt or the MCP server says the same thing the
// rendered page draws. Two shapes cover the docs:
//
// - `FlowDiagram`: columns of boxes joined left to right by labelled arrows,
//   such as contracts → store → transport → server. A column may hold several
//   boxes, which is how fan-in (many tabs, one owner) is drawn.
// - `SequenceDiagram`: participants across the top and numbered messages
//   between them, read top to bottom, for an exchange over time.
//
// Both are figures with a caption, and every box and message is real text, so
// a screen reader reads the diagram as its steps.

export interface FlowNode {
	title: string;
	detail?: string;
}

export interface FlowColumn {
	nodes: readonly FlowNode[];
	/** The arrow from this column to the next, and what it carries. */
	arrow?: string;
}

export function FlowDiagram(props: { label: string; columns: readonly FlowColumn[] }) @{
	<>
		<style>
			.flow {
				margin: 1.6rem 0;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 0.75rem;
				background: var(--surface-subtle);
				container-type: inline-size;
			}
			.flow-row {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				overflow-x: auto;
			}
			.flow-column {
				display: flex;
				flex: 1 1 0;
				flex-direction: column;
				gap: 0.5rem;
				min-width: 7.5rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.flow-node {
				padding: 0.55rem 0.7rem;
				border: 1px solid var(--border-strong);
				border-radius: 0.5rem;
				background: var(--surface);
				text-align: center;
			}
			.flow-title {
				display: block;
				color: var(--text);
				font-weight: 600;
				font-size: 0.9rem;
			}
			.flow-detail {
				display: block;
				margin-top: 0.2rem;
				color: var(--text-secondary);
				font-size: 0.78rem;
				line-height: 1.35;
			}
			.flow-arrow {
				display: flex;
				flex: 0 0 auto;
				flex-direction: column;
				align-items: center;
				max-width: 7rem;
				color: var(--accent-text);
				font-size: 0.75rem;
				text-align: center;
			}
			.flow-arrow-head {
				font-size: 1.2rem;
				line-height: 1;
			}
			figcaption {
				margin-top: 0.75rem;
				color: var(--text-secondary);
				font-size: 0.85rem;
				text-align: center;
			}
			/* Too narrow for the boxes side by side: read top to bottom instead. */
			@container (max-width: 760px) {
				.flow-row {
					flex-direction: column;
					align-items: stretch;
				}
				.flow-column {
					flex-direction: row;
				}
				.flow-node {
					flex: 1 1 0;
				}
				.flow-arrow {
					flex-direction: row;
					justify-content: center;
					gap: 0.4rem;
					max-width: none;
				}
				.flow-arrow-head {
					transform: rotate(90deg);
				}
			}
		</style>
		<figure class="flow">
			<div class="flow-row">
				@for (const column of props.columns; key column.nodes.map((node) => node.title).join('|')) {
					<>
						<ul class="flow-column">
							@for (const node of column.nodes; key node.title) {
								<li class="flow-node">
									<span class="flow-title">{node.title as string}</span>
									@if (node.detail) {
										<span class="flow-detail">{node.detail as string}</span>
									}
								</li>
							}
						</ul>
						@if (column.arrow !== undefined) {
							<div class="flow-arrow">
								<span class="flow-arrow-head" aria-hidden="true">
									→
								</span>
								<span>{column.arrow as string}</span>
							</div>
						}
					</>
				}
			</div>
			<figcaption>{props.label as string}</figcaption>
		</figure>
	</>
}

export interface SequenceStep {
	/** Index into `actors` of the sender. */
	from: number;
	/** Index into `actors` of the receiver; equal to `from` for a note. */
	to: number;
	text: string;
}

export function SequenceDiagram(props: {
	label: string;
	actors: readonly string[];
	steps: readonly SequenceStep[];
}) @{
	const columns = `repeat(${props.actors.length}, minmax(6.5rem, 1fr))`;
	<>
		<style>
			.sequence {
				margin: 1.6rem 0;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 0.75rem;
				background: var(--surface-subtle);
				overflow-x: auto;
			}
			.sequence-grid {
				display: grid;
				row-gap: 0.35rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.sequence-actor {
				padding: 0.45rem 0.5rem;
				border: 1px solid var(--border-strong);
				border-radius: 0.5rem;
				background: var(--surface);
				color: var(--text);
				font-weight: 600;
				font-size: 0.85rem;
				text-align: center;
			}
			.sequence-step {
				display: flex;
				flex-direction: column;
				padding: 0.3rem 0.5rem 0;
				color: var(--text-body);
				font-size: 0.8rem;
				line-height: 1.35;
			}
			.sequence-line {
				margin-top: 0.25rem;
				border-top: 2px solid var(--accent);
				position: relative;
				height: 0;
			}
			.sequence-line::after {
				position: absolute;
				top: -0.62rem;
				color: var(--accent);
				font-size: 0.9rem;
			}
			.sequence-right .sequence-line::after {
				right: -0.2rem;
				content: '▶';
			}
			.sequence-left .sequence-line::after {
				left: -0.2rem;
				content: '◀';
			}
			.sequence-note {
				padding: 0.3rem 0.5rem;
				border: 1px dashed var(--border-strong);
				border-radius: 0.4rem;
				text-align: center;
			}
			.sequence-number {
				color: var(--accent-text);
				font-weight: 600;
			}
			figcaption {
				margin-top: 0.75rem;
				color: var(--text-secondary);
				font-size: 0.85rem;
				text-align: center;
			}
		</style>
		<figure class="sequence">
			<div class="sequence-grid" style={{ gridTemplateColumns: columns }} aria-hidden="true">
				@for (const actor of props.actors; key actor) {
					<div class="sequence-actor">{actor as string}</div>
				}
			</div>
			<ol class="sequence-grid" style={{ gridTemplateColumns: columns }}>
				@for (const [index, step] of props.steps.entries(); key index) {
					const start = Math.min(step.from, step.to) + 1;
					const end = Math.max(step.from, step.to) + 2;
					const direction =
						step.from === step.to
							? 'sequence-note'
							: step.from < step.to
								? 'sequence-right'
								: 'sequence-left';
					<li
						class={['sequence-step', direction]}
						style={{ gridColumn: `${start} / ${end}` }}
						aria-label={`${index + 1}. ${props.actors[step.from]} to ${props.actors[step.to]}: ${step.text}`}
					>
						<span>
							<span class="sequence-number">{`${index + 1}. `}</span>
							{step.text as string}
						</span>
						@if (step.from !== step.to) {
							<span class="sequence-line" aria-hidden="true" />
						}
					</li>
				}
			</ol>
			<figcaption>{props.label as string}</figcaption>
		</figure>
	</>
}
