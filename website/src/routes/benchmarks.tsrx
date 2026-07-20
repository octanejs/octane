import { createFileRoute } from '@octanejs/tanstack-router';
import { Benchmarks } from '../pages/benchmarks/Benchmarks.tsrx';

export const Route = createFileRoute('/benchmarks')({ component: Benchmarks });
