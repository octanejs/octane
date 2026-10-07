import { DropZoneEditPure, DropZonePure } from '../../../DropZone/index.tsrx';
import { rootDroppableId } from '../../../../lib/root-droppable-id';
import {
	type FC,
	type OctaneNode,
	RefObject,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useMemo,
} from '../../../../react-shim.js';
import { useAppStore } from '../../../../store';
import AutoFrame, { autoFrameContext } from '../../../AutoFrame/index.tsrx';
import styles from './styles.module.css';
import { getClassNameFactory } from '../../../../lib';
import { DefaultRootRenderProps, Overrides } from '../../../../types';
import { Render } from '../../../Render/index.tsrx';
import { BubbledPointerEvent } from '../../../../lib/bubble-pointer-event';
import { useSlots } from '../../../../lib/use-slots.tsrx';

const getClassName = getClassNameFactory('PuckPreview', styles);

type PageProps = DefaultRootRenderProps;

const useBubbleIframeEvents = (ref: RefObject<HTMLIFrameElement | null>) => {
	const status = useAppStore((s) => s.status);

	useEffect(() => {
		if (ref.current && status === 'READY') {
			const iframe = ref.current;

			const handlePointerMove = (event: PointerEvent) => {
				const evt = new BubbledPointerEvent('pointermove', {
					...event,
					bubbles: true,
					cancelable: false,
					clientX: event.clientX,
					clientY: event.clientY,
					originalTarget: event.target,
				});

				iframe.dispatchEvent(evt as any);
			};

			const register = () => {
				unregister();

				// Add event listeners
				iframe.contentDocument?.addEventListener('pointermove', handlePointerMove, {
					capture: true,
				});
			};

			const unregister = () => {
				// Clean up event listeners
				iframe.contentDocument?.removeEventListener('pointermove', handlePointerMove);
			};

			register();

			return () => {
				unregister();
			};
		}
	}, [status]);
};

// Upstream reads the frame document with `<autoFrameContext.Consumer>`, which
// Octane contexts do not have; read it with `useContext` instead.
const FrameContent = ({
	Frame,
	children,
}: {
	Frame: Overrides['iframe'] | undefined;
	children: OctaneNode;
}) => {
	const { document } = useContext(autoFrameContext);

	if (Frame) {
		return <Frame document={document}>{children}</Frame>;
	}

	return <>{children}</>;
};

export const Preview = ({ id = 'puck-preview' }: { id?: string }) => {
	const dispatch = useAppStore((s) => s.dispatch);
	const root = useAppStore((s) => s.state.data.root);
	const config = useAppStore((s) => s.config);
	const setStatus = useAppStore((s) => s.setStatus);
	const iframe = useAppStore((s) => s.iframe);
	const overrides = useAppStore((s) => s.overrides);
	const metadata = useAppStore((s) => s.metadata);
	const renderData = useAppStore((s) => (s.state.ui.previewMode === 'edit' ? null : s.state.data));

	const Page = useCallback<FC<PageProps>>(
		(pageProps) => {
			// eslint-disable-next-line react-hooks/rules-of-hooks
			const propsWithSlots = useSlots(config, { type: 'root', props: pageProps }, DropZoneEditPure);

			return config.root?.render ? (
				config.root?.render({
					id: 'puck-root',
					...propsWithSlots,
				})
			) : (
				<>{propsWithSlots.children}</>
			);
		},
		[config],
	);

	const Frame = useMemo(() => overrides.iframe, [overrides]);

	// DEPRECATED
	const rootProps = root.props || root;

	const ref = useRef<HTMLIFrameElement | null>(null);

	useBubbleIframeEvents(ref);

	const inner = !renderData ? (
		<Page
			{...rootProps}
			puck={{
				renderDropZone: DropZonePure,
				isEditing: true,
				dragRef: null,
				metadata,
			}}
			editMode={true}
		>
			<DropZonePure zone={rootDroppableId} />
		</Page>
	) : (
		<Render data={renderData} config={config} metadata={metadata} />
	);

	useEffect(() => {
		if (!iframe.enabled) {
			setStatus('READY');
		}
	}, [iframe.enabled]);

	return (
		<div
			className={getClassName()}
			id={id}
			data-puck-preview
			onClick={(e) => {
				const el = e.target as Element;

				if (!el.hasAttribute('data-puck-component') && !el.hasAttribute('data-puck-dropzone')) {
					dispatch({ type: 'setUi', ui: { itemSelector: null } });
				}
			}}
		>
			{iframe.enabled ? (
				<AutoFrame
					id="preview-frame"
					className={getClassName('frame')}
					data-rfd-iframe
					onReady={() => {
						setStatus('READY');
					}}
					onNotReady={() => {
						setStatus('MOUNTED');
					}}
					frameRef={ref}
				>
					<FrameContent Frame={Frame}>{inner}</FrameContent>
				</AutoFrame>
			) : (
				<div id="preview-frame" className={getClassName('frame')} ref={ref} data-puck-entry>
					{inner}
				</div>
			)}
		</div>
	);
};
