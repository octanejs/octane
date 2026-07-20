import { createFileRoute } from '@octanejs/tanstack-router';
import { DocPage } from '../pages/doc-page/DocPage.tsrx';

export const Route = createFileRoute('/docs/')({ component: DocPage });
