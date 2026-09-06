'use client';
import type * as React from 'octane';
import { useDialogRootContext } from '../../dialog/root/DialogRootContext';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { DRAWER_CONTENT_ATTRIBUTE } from './drawerContentAttribute';

/**
 * A container for the drawer contents.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export const DrawerContent = function DrawerContent(
	componentPropsWithRef: React.PropsWithoutRef<DrawerContent.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	useDialogRootContext();

	return useRenderElement('div', componentProps, {
		ref: forwardedRef,
		props: [{ [DRAWER_CONTENT_ATTRIBUTE as string]: '' }, elementProps],
	});
};

export interface DrawerContentProps extends BaseUIComponentProps<'div', DrawerContentState> {}

export interface DrawerContentState {}

export namespace DrawerContent {
	export type Props = DrawerContentProps;
	export type State = DrawerContentState;
}
