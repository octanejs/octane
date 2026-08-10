import {
	Scroll,
	ScrollControls,
	useScroll,
	type ScrollControlsProps,
	type ScrollControlsState,
	type ScrollProps,
} from '@octanejs/drei';

const controls: ScrollControlsProps = { pages: 3, distance: 2, horizontal: true, children: null };
const canvas: ScrollProps = { html: false };
const html: ScrollProps = { html: true, style: { color: 'red' } };
declare const state: ScrollControlsState;
state.range(0, 0.5, 0.1);
state.curve(0, 0.5);
state.visible(0, 0.5);
void [Scroll, ScrollControls, useScroll, controls, canvas, html];

// @ts-expect-error canvas scrolling does not accept DOM styles
const invalid: ScrollProps = { html: false, style: { color: 'red' } };
void invalid;
