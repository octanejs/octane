// One shared QueryClient for the app. Kept in its own module so both App.tsx and
// any future prefetch code reference the same instance.
import { QueryClient } from '@octanejs/query';

export const queryClient = new QueryClient();
