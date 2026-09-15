import './published-pristine-contract';
import type {
	GroupImperativeHandle,
	GroupProps,
	Layout,
	OnGroupLayoutChange,
	OnPanelResize,
	Orientation,
	PanelImperativeHandle,
	PanelProps,
	PanelSize,
	SeparatorProps,
	SizeUnit,
} from 'react-resizable-panels';

declare function expectType<T>(value: T): void;

const groupProps: GroupProps = {
	orientation: 'horizontal',
	defaultLayout: { left: 50, right: 50 },
};
const panelProps: PanelProps = { minSize: '10%', maxSize: 500, collapsible: true };
const separatorProps: SeparatorProps = { disabled: false, disableDoubleClick: true };
const orientation: Orientation = 'vertical';
const unit: SizeUnit = 'rem';
const layout: Layout = { navigation: 25, content: 75 };
const size: PanelSize = { asPercentage: 25, inPixels: 200 };
const groupHandle = null as unknown as GroupImperativeHandle;
const panelHandle = null as unknown as PanelImperativeHandle;
const groupCallback: OnGroupLayoutChange = function onGroupLayoutChange(next) {
	void next;
};
const panelCallback: OnPanelResize = function onPanelResize(next) {
	void next.inPixels;
};

expectType<GroupProps>(groupProps);
expectType<PanelProps>(panelProps);
expectType<SeparatorProps>(separatorProps);
expectType<Orientation>(orientation);
expectType<SizeUnit>(unit);
expectType<Layout>(layout);
expectType<PanelSize>(size);
expectType<GroupImperativeHandle>(groupHandle);
expectType<PanelImperativeHandle>(panelHandle);
expectType<OnGroupLayoutChange>(groupCallback);
expectType<OnPanelResize>(panelCallback);

// @ts-expect-error orientations are restricted to the pinned public union
const invalidGroup: GroupProps = { orientation: 'diagonal' };
// @ts-expect-error panel size constraints reject arbitrary objects
const invalidPanel: PanelProps = { minSize: { pixels: 10 } };
// @ts-expect-error unsupported CSS unit
const invalidUnit: SizeUnit = 'ch';
// @ts-expect-error layout values must be numeric percentages
const invalidLayout: Layout = { navigation: '25' };

void [invalidGroup, invalidPanel, invalidUnit, invalidLayout];

import * as Panels from 'react-resizable-panels';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';

type LayoutValues = Assert<Equal<Panels.Layout[string], number>>;
type OrientationValues = Assert<Equal<Panels.Orientation, 'horizontal' | 'vertical'>>;
type ResizePixels = Assert<Equal<Panels.PanelSize['inPixels'], number>>;
declare const persistence: ReturnType<typeof Panels.useDefaultLayout>;
const storage: Panels.LayoutStorage = { getItem: () => null, setItem: (_key, _value) => {} };
const options: Parameters<typeof Panels.useDefaultLayout>[0] = { id: 'saved', storage };
declare const meta: Panels.LayoutChangedMeta;
const interaction: boolean = meta.isUserInteraction;
const savedLayout: Panels.Layout | undefined = persistence.defaultLayout;
// @ts-expect-error Persisted layouts must have numeric percentages.
const invalidSavedLayout: Panels.Layout = { left: 'half' };
// @ts-expect-error Resize observations expose numeric pixels.
const invalidPixels: string = (null as unknown as Panels.PanelSize).inPixels;
void [options, interaction, savedLayout, invalidSavedLayout, invalidPixels];
