// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/sonner.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). IconPlaceholder resolves to lucide (see
// spinner.tsrx).
//
// Octane divergence (shadcn-sonner-theme): upstream reads the theme from next-themes' useTheme()
// (Next.js-specific); here `theme` is an ordinary prop with upstream's
// 'system' default — pass your app's theme source explicitly. The icon
// descriptors are composed with createElement (they travel through a props
// object, the documented channel for element descriptors).
import { createElement } from 'octane';
import { Toaster as Sonner, type ToasterProps } from '@octanejs/sonner';
import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from '@octanejs/lucide';

export function Toaster({ theme = 'system', ...props }: ToasterProps) {
	return createElement(Sonner, {
		theme: theme as ToasterProps['theme'],
		className: 'toaster group',
		icons: {
			success: createElement(CircleCheckIcon, { className: 'size-4' }),
			info: createElement(InfoIcon, { className: 'size-4' }),
			warning: createElement(TriangleAlertIcon, { className: 'size-4' }),
			error: createElement(OctagonXIcon, { className: 'size-4' }),
			loading: createElement(Loader2Icon, { className: 'size-4 animate-spin' }),
		},
		style: {
			'--normal-bg': 'var(--popover)',
			'--normal-text': 'var(--popover-foreground)',
			'--normal-border': 'var(--border)',
			'--border-radius': 'var(--radius)',
		},
		toastOptions: {
			classNames: {
				toast: 'cn-toast',
			},
		},
		...props,
	});
}
