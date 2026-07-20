import { createFileRoute } from '@octanejs/tanstack-router';
import { Home } from '../pages/home/Home.tsrx';

export const Route = createFileRoute('/')({ component: Home });
