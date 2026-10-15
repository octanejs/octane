import { createFileRoute } from '@octanejs/tanstack-router/compiled';
import { Playground } from '../pages/playground/Playground.tsrx';

export const Route = createFileRoute('/playground')({ component: Playground });
