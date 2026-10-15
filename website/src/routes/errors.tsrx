import { createFileRoute } from '@octanejs/tanstack-router/compiled';
import { ErrorCodesLayout } from '../pages/error-codes/ErrorCodes.tsrx';

export const Route = createFileRoute('/errors')({ component: ErrorCodesLayout });
