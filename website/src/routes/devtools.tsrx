import { createFileRoute } from '@octanejs/tanstack-router';
import { DevtoolsDemo } from '../pages/devtools-demo/DevtoolsDemo.tsrx';

export const Route = createFileRoute('/devtools')({ component: DevtoolsDemo });
