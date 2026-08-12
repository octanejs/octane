import { Manager, Popper, Reference, usePopper } from '@octanejs/popper';
import { ManagerReferenceNodeSetterContext } from '../../../src/components.tsrx';
import type { Instance, VirtualElement } from '@popperjs/core';

export function UsePopperHarness(props: {
	referenceElement: Element | VirtualElement | null;
	popperElement: HTMLElement | null;
	createPopper: any;
	placement?: any;
	modifiers?: any[];
	options?: Record<string, unknown>;
}) {
	const result = usePopper(props.referenceElement, props.popperElement, {
		...props.options,
		createPopper: props.createPopper,
		placement: props.placement,
		modifiers: props.modifiers,
	});
	return <output
		id="result"
		data-state={result.state?.placement ?? 'null'}
		data-popper-position={String(result.styles.popper?.position)}
		data-arrow-position={String(result.styles.arrow?.position)}
		data-arrow-transform={String(result.styles.arrow?.transform)}
		data-update={String(result.update != null)}
		data-force-update={String(result.forceUpdate != null)}
	/>;
}

export function UsePopperOptionalArgsHarness(props: { referenceElement: Element }) {
	const empty = usePopper();
	const referenceOnly = usePopper(props.referenceElement);
	const nullPopper = usePopper(props.referenceElement, null);
	return <output
		id="optional-results"
		data-empty-position={String(empty.styles.popper?.position)}
		data-reference-position={String(referenceOnly.styles.popper?.position)}
		data-null-position={String(nullPopper.styles.popper?.position)}
	/>;
}

export function ManagedPopperHarness(props: {
	placement?: any;
	innerRef?: any;
	referenceElement?: HTMLElement | VirtualElement;
	onSnapshot?: (value: any) => void;
}) {
	return <Manager>
		<Reference>
			{({ ref }) => <button id="reference" ref={ref}>reference</button>}
		</Reference>
		<Popper
			placement={props.placement}
			innerRef={props.innerRef}
			referenceElement={props.referenceElement}
		>
			{(snapshot) => {
				props.onSnapshot?.(snapshot);
				return <div
					id="popper"
					ref={snapshot.ref}
					style={snapshot.style as any}
					data-placement={snapshot.placement}
				>
					<div id="arrow" ref={snapshot.arrowProps.ref} style={snapshot.arrowProps.style as any} />
				</div>;
			}}
		</Popper>
	</Manager>;
}

export function BareReferenceHarness(props: { innerRef?: any }) {
	return <Reference innerRef={props.innerRef}>
		{({ ref }) => <div id="reference" ref={ref} />}
	</Reference>;
}

export function TransparentManagerHarness() {
	return <Manager>
		<div id="reference" />
		<div id="popper" />
	</Manager>;
}

/** Direct ManagerReferenceNodeSetterContext.Provider fixture matching upstream Reference.test.js. */
export function ReferenceProviderHarness(props: {
	setReferenceNode?: ((node: Element | null) => void) | undefined;
	innerRef?: any;
}) {
	return <ManagerReferenceNodeSetterContext.Provider value={props.setReferenceNode}>
		<Reference innerRef={props.innerRef}>
			{({ ref }) => <div id="reference" ref={ref} />}
		</Reference>
	</ManagerReferenceNodeSetterContext.Provider>;
}

export function ReferenceSetterSpyHarness(props: {
	setReferenceNode: (node: Element | null) => void;
}) {
	return <ReferenceProviderHarness setReferenceNode={props.setReferenceNode} />;
}

export function ServerPopperHarness() {
	return <Manager>
		<Reference>
			{({ ref }) => <button id="reference" ref={ref}>reference</button>}
		</Reference>
		<Popper placement="top">
			{({ ref, style, placement, arrowProps }) => <div
				id="popper"
				ref={ref}
				style={style as any}
				data-placement={placement}
			>
				<div id="arrow" ref={arrowProps.ref} style={arrowProps.style as any} />
			</div>}
		</Popper>
	</Manager>;
}
