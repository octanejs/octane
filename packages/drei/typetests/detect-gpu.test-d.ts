import { DetectGPU, type DetectGPUProps, useDetectGPU } from '../src/index.js';

const props: DetectGPUProps = {
	failIfMajorPerformanceCaveat: true,
	desktopTiers: [0, 20, 40, 60],
	children: (result) => result.tier,
};
DetectGPU;
useDetectGPU;
props;

// @ts-expect-error desktop tiers are numbers
const invalidTiers: DetectGPUProps = { desktopTiers: ['slow'] };
// @ts-expect-error caveat flag is boolean
const invalidCaveat: DetectGPUProps = { failIfMajorPerformanceCaveat: 'yes' };
