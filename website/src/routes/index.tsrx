import { createFileRoute } from '@tanstack/octane-router';
import { Home } from '../pages/home/Home.tsrx';

export const Route = createFileRoute('/')({ component: Home });
