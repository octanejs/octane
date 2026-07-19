import { createFileRoute } from '@tanstack/octane-router';
import { Playground } from '../pages/playground/Playground.tsrx';

export const Route = createFileRoute('/playground')({ component: Playground });
