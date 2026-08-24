/** @jsxImportSource octane */
import { Skeleton } from '../../src/index.js';

const bones = {
	name: 'hydration-card',
	width: 320,
	height: 80,
	bones: [[5, 10, 90, 24, 6]] as const,
};

export function HydrationSkeleton() {
	return <Skeleton loading initialBones={bones} animate={false} color="#dedede" />;
}
