import { createFileRoute } from '@tanstack/octane-router';
import { DocPage } from '../pages/doc-page/DocPage.tsrx';

export const Route = createFileRoute('/docs/')({ component: DocPage });
