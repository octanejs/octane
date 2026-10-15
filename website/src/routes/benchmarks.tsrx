import { createFileRoute } from '@octanejs/tanstack-router/compiled';
import { Benchmarks } from '../pages/benchmarks/Benchmarks.tsrx';

export const Route = createFileRoute('/benchmarks')({ component: Benchmarks });
