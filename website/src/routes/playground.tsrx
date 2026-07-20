import { createFileRoute } from '@octanejs/tanstack-router';
import { Playground } from '../pages/playground/Playground.tsrx';

export const Route = createFileRoute('/playground')({ component: Playground });
