import { createFileRoute } from '@octanejs/tanstack-router/compiled';
import { DocsLayout } from '../layouts/DocsLayout.tsrx';

export const Route = createFileRoute('/docs')({ component: DocsLayout });
