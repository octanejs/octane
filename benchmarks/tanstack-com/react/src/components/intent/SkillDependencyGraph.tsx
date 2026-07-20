import * as React from 'react';
import {
	forceSimulation,
	forceLink,
	forceManyBody,
	forceCenter,
	forceCollide,
	type SimulationNodeDatum,
	type SimulationLinkDatum,
} from 'd3';
import { Link } from '@tanstack/react-router';
import { SKILL_TYPE_STYLES } from '~/routes/intent/registry/$packageName';

interface SkillNode {
	name: string;
	type: string | null;
	requires: Array<string> | null;
}

interface GraphNode extends SimulationNodeDatum {
	id: string;
	type: string | null;
	hasIncoming: boolean;
	hasOutgoing: boolean;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
	source: string | GraphNode;
	target: string | GraphNode;
}

const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
	core: { fill: '#8b5cf6', stroke: '#7c3aed' },
	'sub-skill': { fill: '#6b7280', stroke: '#4b5563' },
	framework: { fill: '#f59e0b', stroke: '#d97706' },
	lifecycle: { fill: '#10b981', stroke: '#059669' },
	composition: { fill: '#3b82f6', stroke: '#2563eb' },
	security: { fill: '#ef4444', stroke: '#dc2626' },
};

const DEFAULT_COLOR = { fill: '#9ca3af', stroke: '#6b7280' };

export function SkillDependencyGraph({
	skills,
	packageName,
}: {
	readonly skills: Array<SkillNode>;
	readonly packageName: string;
}) {
	const svgRef = React.useRef<SVGSVGElement>(null);
	const [nodes, setNodes] = React.useState<Array<GraphNode>>([]);
	const [links, setLinks] = React.useState<Array<GraphLink>>([]);
	const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

	// Build graph data
	const { graphNodes, graphLinks, hasEdges } = React.useMemo(() => {
		const skillNames = new Set(skills.map((s) => s.name));
		const gNodes: Array<GraphNode> = skills.map((s) => ({
			id: s.name,
			type: s.type,
			hasIncoming: false,
			hasOutgoing: (s.requires?.filter((r) => skillNames.has(r)).length ?? 0) > 0,
		}));

		const gLinks: Array<GraphLink> = [];
		const incomingSet = new Set<string>();

		for (const skill of skills) {
			if (!skill.requires) continue;
			for (const req of skill.requires) {
				if (skillNames.has(req)) {
					gLinks.push({ source: skill.name, target: req });
					incomingSet.add(req);
				}
			}
		}

		for (const node of gNodes) {
			node.hasIncoming = incomingSet.has(node.id);
		}

		return {
			graphNodes: gNodes,
			graphLinks: gLinks,
			hasEdges: gLinks.length > 0,
		};
	}, [skills]);

	// Measure container
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!containerRef.current) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width } = entry.contentRect;
			const height = Math.min(Math.max(width * 0.6, 200), 400);
			setDimensions({ width, height });
		});
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	// Run force simulation
	React.useEffect(() => {
		if (dimensions.width === 0 || graphNodes.length === 0) return;

		const nodesCopy = graphNodes.map((n) => ({ ...n }));
		const linksCopy = graphLinks.map((l) => ({ ...l }));

		const sim = forceSimulation(nodesCopy)
			.force(
				'link',
				forceLink<GraphNode, GraphLink>(linksCopy)
					.id((d) => d.id)
					.distance(80),
			)
			.force('charge', forceManyBody().strength(-200))
			.force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
			.force('collide', forceCollide(35));

		sim.on('end', () => {
			setNodes([...nodesCopy]);
			setLinks(
				linksCopy.map((l) => ({
					...l,
					source: l.source as GraphNode,
					target: l.target as GraphNode,
				})),
			);
		});

		// Run synchronously for small graphs
		sim.tick(200);
		sim.stop();
		setNodes([...nodesCopy]);
		setLinks(
			linksCopy.map((l) => ({
				...l,
				source: l.source as GraphNode,
				target: l.target as GraphNode,
			})),
		);

		return () => {
			sim.stop();
		};
	}, [graphNodes, graphLinks, dimensions]);

	if (!hasEdges) return null;

	const NODE_RADIUS = 6;

	return (
		<div
			ref={containerRef}
			className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50/50 dark:bg-gray-900/30"
		>
			{dimensions.width > 0 && nodes.length > 0 && (
				<svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="block">
					<defs>
						<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
							<path
								d="M0,0 L8,3 L0,6"
								fill="none"
								stroke="currentColor"
								strokeWidth="1"
								className="text-gray-400 dark:text-gray-600"
							/>
						</marker>
					</defs>

					{/* Links */}
					{links.map((link, i) => {
						const source = link.source as GraphNode;
						const target = link.target as GraphNode;
						if (source.x == null || source.y == null || target.x == null || target.y == null)
							return null;

						// Shorten line to stop at node edge
						const dx = target.x - source.x;
						const dy = target.y - source.y;
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist === 0) return null;
						const offsetX = (dx / dist) * (NODE_RADIUS + 4);
						const offsetY = (dy / dist) * (NODE_RADIUS + 4);

						return (
							<line
								key={i}
								x1={source.x + offsetX}
								y1={source.y + offsetY}
								x2={target.x - offsetX}
								y2={target.y - offsetY}
								stroke="currentColor"
								strokeWidth={1.5}
								className="text-gray-300 dark:text-gray-700"
								markerEnd="url(#arrowhead)"
							/>
						);
					})}

					{/* Nodes */}
					{nodes.map((node) => {
						if (node.x == null || node.y == null) return null;
						const colors = TYPE_COLORS[node.type ?? ''] ?? DEFAULT_COLOR;

						return (
							<Link
								key={node.id}
								to="/intent/registry/$packageName/$skillName"
								params={{ packageName, skillName: node.id }}
							>
								<g className="cursor-pointer group">
									<circle
										cx={node.x}
										cy={node.y}
										r={NODE_RADIUS}
										fill={colors.fill}
										stroke={colors.stroke}
										strokeWidth={1.5}
										opacity={0.85}
										className="transition-opacity group-hover:opacity-100"
									/>
									<text
										x={node.x}
										y={node.y + NODE_RADIUS + 12}
										textAnchor="middle"
										className="text-[10px] fill-gray-500 dark:fill-gray-400 font-mono group-hover:fill-gray-900 dark:group-hover:fill-gray-100 transition-colors"
									>
										{node.id}
									</text>
								</g>
							</Link>
						);
					})}
				</svg>
			)}

			{/* Legend */}
			<div className="flex items-center gap-3 px-3 py-2 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
				<span className="uppercase tracking-wider font-medium">Dependencies</span>
				<span className="text-gray-300 dark:text-gray-700">|</span>
				{Object.entries(SKILL_TYPE_STYLES)
					.filter(([type]) => skills.some((s) => s.type === type))
					.map(([type]) => {
						const colors = TYPE_COLORS[type] ?? DEFAULT_COLOR;
						return (
							<span key={type} className="flex items-center gap-1">
								<span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.fill }} />
								{type}
							</span>
						);
					})}
			</div>
		</div>
	);
}
