export function SkillSparklineFallback({ height = 40 }: { height?: number }) {
	return (
		<div
			className="animate-pulse rounded bg-gray-100 dark:bg-gray-800/40"
			style={{ width: '100%', height }}
		/>
	);
}
