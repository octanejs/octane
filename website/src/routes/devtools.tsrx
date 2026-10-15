import { createFileRoute } from '@octanejs/tanstack-router/compiled';
import { DevtoolsDemo } from '../pages/devtools-demo/DevtoolsDemo.tsrx';

export const Route = createFileRoute('/devtools')({ component: DevtoolsDemo });
