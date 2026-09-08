import type {
	GroupImperativeHandle,
	GroupProps,
	OnGroupLayoutChange,
	OnPanelResize,
	PanelImperativeHandle,
	PanelProps,
	SeparatorProps,
} from '../../upstream-artifact/dist/react-resizable-panels.js';

const groupProps: GroupProps = {
	orientation: 'horizontal',
	defaultLayout: { left: 50, right: 50 },
};
const panelProps: PanelProps = { minSize: '10%', maxSize: 500, collapsible: true };
const separatorProps: SeparatorProps = { disabled: false, disableDoubleClick: true };
const groupHandle = null as unknown as GroupImperativeHandle;
const panelHandle = null as unknown as PanelImperativeHandle;
const groupCallback: OnGroupLayoutChange = (layout) => void layout;
const panelCallback: OnPanelResize = (size) => void size.inPixels;
// @ts-expect-error orientations are restricted to the pinned public union
const invalidGroup: GroupProps = { orientation: 'diagonal' };
// @ts-expect-error panel size constraints reject arbitrary objects
const invalidPanel: PanelProps = { minSize: { pixels: 10 } };

void [
	groupProps,
	panelProps,
	separatorProps,
	groupHandle,
	panelHandle,
	groupCallback,
	panelCallback,
	invalidGroup,
	invalidPanel,
];
