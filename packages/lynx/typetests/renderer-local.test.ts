import type { JSX as ReactJSX } from 'react';
import type {
	LynxElements,
	LynxInputEvent,
	LynxIntrinsicElements,
} from '@octanejs/lynx/intrinsics';
import type { JSX as RendererJSX } from '@octanejs/lynx/intrinsics/jsx-runtime';

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
	style: { opacity: 0.75 },
	bindtap(event, instance) {
		const targetId: string = event.target.id;
		const touchX: number = event.detail.x;
		const firstTouchPageY: number | undefined = event.touches[0]?.pageY;
		instance?.triggerEvent('packed-lynx-probe');
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

// @ts-expect-error DOM-only attributes are not accepted by the Lynx view contract.
const domOnlyViewProps: RendererElements['view'] = { dangerouslySetInnerHTML: { __html: '' } };

// @ts-expect-error Every list item requires its native recycling key.
const missingListItemKey: RendererElements['list-item'] = { recyclable: true };

// @ts-expect-error Custom elements require explicit module augmentation.
const unregisteredCustomProps: RendererElements['native-video'] = {};

void viewProps;
void rawTextProps;
void imageProps;
void inputProps;
void listItemProps;
void nativeMapProps;
void domOnlyViewProps;
void missingListItemKey;
void unregisteredCustomProps;
