import { createFileRoute } from '@tanstack/octane-router';
import { DocsLayout } from '../layouts/DocsLayout.tsrx';

export const Route = createFileRoute('/docs')({ component: DocsLayout });
