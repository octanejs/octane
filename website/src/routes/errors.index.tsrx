import { createFileRoute } from '@tanstack/octane-router';
import { ErrorCodesIndex } from '../pages/error-codes/ErrorCodes.tsrx';

export const Route = createFileRoute('/errors/')({ component: ErrorCodesIndex });
