import { createFileRoute } from '@octanejs/tanstack-router';
import { DocsLayout } from '../layouts/DocsLayout.tsrx';

export const Route = createFileRoute('/docs')({ component: DocsLayout });
