import {
	PerformanceMonitor,
	type PerformanceMonitorApi,
	type PerformanceMonitorProps,
	usePerformanceMonitor,
} from '../src/index.js';

const props: PerformanceMonitorProps = {
	iterations: 4,
	bounds: (rate) => [rate / 2, rate],
	onChange: (api: PerformanceMonitorApi) => api.factor,
};
PerformanceMonitor;
usePerformanceMonitor;
props;

// @ts-expect-error bounds returns a numeric tuple
const invalidBounds: PerformanceMonitorProps = { bounds: () => ['slow', 'fast'] };
// @ts-expect-error threshold is numeric
const invalidThreshold: PerformanceMonitorProps = { threshold: true };
