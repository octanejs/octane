import { createFileRoute } from '@tanstack/octane-router';
import { Benchmarks } from '../pages/benchmarks/Benchmarks.tsrx';

export const Route = createFileRoute('/benchmarks')({ component: Benchmarks });
