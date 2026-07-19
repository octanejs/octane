import type { JSX as ReactJSX } from 'react';
import { root, type LynxPublicHandle } from '@octanejs/lynx';
import type {
	LynxElements,
	LynxInputEvent,
	LynxIntrinsicElements,
} from '@octanejs/lynx/intrinsics';
import type { JSX as RendererJSX } from '@octanejs/lynx/intrinsics/jsx-runtime';
import { installLynxMainThread, type LynxMainThreadController } from '@octanejs/lynx/main-thread';
import type { UniversalComponent } from '@octanejs/lynx/renderer';

declare module '@octanejs/lynx/intrinsics' {
	interface LynxCustomIntrinsicElements {
		'native-map': {
			region: string;
			bindregionchange?: (event: { detail: { region: string } }) => void;
		};
	}
}

type Assert<Value extends true> = Value;
type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;

type RendererElements = RendererJSX.IntrinsicElements;
type _HasPage = Assert<Equal<'page' extends keyof RendererElements ? true : false, true>>;
type _HasView = Assert<Equal<'view' extends keyof RendererElements ? true : false, true>>;
type _HasText = Assert<Equal<'text' extends keyof RendererElements ? true : false, true>>;
type _HasRawText = Assert<Equal<'raw-text' extends keyof RendererElements ? true : false, true>>;
type _HasImage = Assert<Equal<'image' extends keyof RendererElements ? true : false, true>>;
type _HasScrollView = Assert<
	Equal<'scroll-view' extends keyof RendererElements ? true : false, true>
>;
type _HasInput = Assert<Equal<'input' extends keyof RendererElements ? true : false, true>>;
type _HasTextarea = Assert<Equal<'textarea' extends keyof RendererElements ? true : false, true>>;
type _HasList = Assert<Equal<'list' extends keyof RendererElements ? true : false, true>>;
type _HasListItem = Assert<Equal<'list-item' extends keyof RendererElements ? true : false, true>>;
type _NoDomDiv = Assert<Equal<'div' extends keyof RendererElements ? true : false, false>>;
type _NoReactPollution = Assert<
	Equal<'raw-text' extends keyof ReactJSX.IntrinsicElements ? true : false, false>
>;
type _PublicMapMatchesRenderer = Assert<Equal<keyof LynxElements, keyof RendererElements>>;
type _BuiltInsRemainExplicit = Assert<
	Equal<'native-map' extends keyof LynxIntrinsicElements ? true : false, false>
>;

const viewProps: RendererElements['view'] = {
	className: 'card',
	ref(handle) {
		const generation: number | undefined = handle?.generation;
		return () => void generation;
	},
	style: { opacity: 0.75 },
	bindtap(event) {
		const targetId: string = event.target.id;
		const touchX: number = event.detail.x;
		const firstTouchPageY: number | undefined = event.touches[0]?.pageY;
		void targetId;
		void touchX;
		void firstTouchPageY;
	},
};
const rawTextProps: RendererElements['raw-text'] = { text: 'Hello' };
const imageProps: RendererElements['image'] = {
	src: 'asset://hero.png',
	mode: 'aspectFit',
	bindload(event) {
		const eventType: string = event.type;
		const intrinsicWidth: number = event.width;
		void eventType;
		void intrinsicWidth;
	},
	binderror(event) {
		const nativeErrorCode: number = event.error_code;
		void nativeErrorCode;
	},
};
const inputProps: RendererElements['input'] = {
	type: 'email',
	bindinput(event: LynxInputEvent) {
		const value: string = event.detail.value;
		void value;
	},
};
const listItemProps: RendererElements['list-item'] = {
	'item-key': 'account-7',
	recyclable: true,
};
const nativeMapProps: RendererElements['native-map'] = {
	region: '51.5072,-0.1276',
};
const handleRef: { current: LynxPublicHandle | null } = { current: null };
declare const publicHandle: LynxPublicHandle;
const publicHandleRoot: number = publicHandle.root;
const viewWithObjectRef: RendererElements['view'] = { ref: handleRef };
declare const nativeComponent: UniversalComponent<{ label: string }>;
const renderResult: Promise<unknown> = root.render(nativeComponent, { label: 'ready' });
const installMainThread: (options?: { target?: object }) => LynxMainThreadController =
	installLynxMainThread;

// @ts-expect-error DOM-only attributes are not accepted by the Lynx view contract.
const domOnlyViewProps: RendererElements['view'] = { dangerouslySetInnerHTML: { __html: '' } };

// @ts-expect-error Pinned Lynx inline styles accept strings and numbers, not booleans.
const booleanStyleProps: RendererElements['view'] = { style: { opacity: true } };

// @ts-expect-error Every list item requires its native recycling key.
const missingListItemKey: RendererElements['list-item'] = { recyclable: true };

// @ts-expect-error Custom elements require explicit module augmentation.
const unregisteredCustomProps: RendererElements['native-video'] = {};

// @ts-expect-error Root props retain the compiled component contract.
root.render(nativeComponent, { title: 'wrong' });

void viewProps;
void rawTextProps;
void imageProps;
void inputProps;
void listItemProps;
void nativeMapProps;
void publicHandleRoot;
void viewWithObjectRef;
void renderResult;
void installMainThread;
void domOnlyViewProps;
void booleanStyleProps;
void missingListItemKey;
void unregisteredCustomProps;
