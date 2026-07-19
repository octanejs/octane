import { createFileRoute } from '@tanstack/octane-router';
import { ErrorCodesLayout } from '../pages/error-codes/ErrorCodes.tsrx';

export const Route = createFileRoute('/errors')({ component: ErrorCodesLayout });
