import { toast as toastState } from './state';
import type { Octane } from 'octane/jsx-runtime';
import type { ToasterProps, ToastT } from './types';

export const toast: typeof toastState;
export function Toaster(props: ToasterProps): Octane.JSX.Element;
export function useSonner(): { toasts: ToastT[] };
