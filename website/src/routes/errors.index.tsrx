import { createFileRoute } from '@octanejs/tanstack-router/compiled';
import { ErrorCodesIndex } from '../pages/error-codes/ErrorCodes.tsrx';

export const Route = createFileRoute('/errors/')({ component: ErrorCodesIndex });
