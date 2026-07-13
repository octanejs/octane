import { toast as toastState } from './state';
import type { ToasterProps, ToastT } from './types';

export const toast: typeof toastState;
export function Toaster(props: ToasterProps): any;
export function useSonner(): { toasts: ToastT[] };
