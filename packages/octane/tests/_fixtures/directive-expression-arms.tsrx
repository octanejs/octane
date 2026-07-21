import { Fragment, createElement, use } from 'octane';
import type { OctaneNode } from 'octane';

export type RenderableShape = 'primitive' | 'component' | 'host' | 'array' | 'fragment' | 'null';

function ValueComponent(props: { label: string; onClick?: () => void }) @{
	<button id="component-value" onClick={props.onClick}>{props.label}</button>
}

export function RenderableExpressionArm(props: {
	show: boolean;
	shape: RenderableShape;
	label: string;
	onClick?: () => void;
}) @{
	const value: OctaneNode =
		props.shape === 'primitive'
			? props.label
			: props.shape === 'component'
				? createElement(ValueComponent, { label: props.label, onClick: props.onClick })
				: props.shape === 'host'
					? createElement('strong', { id: 'host-value' }, props.label)
					: props.shape === 'array'
						? [
								createElement('i', { id: 'array-value', key: 'array-value' }, props.label),
								' array-tail',
								null,
							]
						: props.shape === 'fragment'
							? createElement(
									Fragment,
									null,
									createElement(
										'span',
										{ id: 'fragment-first', key: 'fragment-first' },
										props.label,
									),
									createElement(
										'span',
										{ id: 'fragment-last', key: 'fragment-last' },
										' fragment-tail',
									),
								)
							: null;
	<section id="renderable-expression-arm">
		@if (props.show) {
			value;
		} @else {
			null;
		}
	</section>
}

export interface DirectiveMatrixProps {
	on: boolean;
	ifOn: OctaneNode;
	ifOff: OctaneNode;
	elseIfBranch: string;
	elseIfFirst: OctaneNode;
	elseIfSecond: OctaneNode;
	elseIfFallback: OctaneNode;
	items: ReadonlyArray<{ id: string; value: OctaneNode }>;
	emptyValue: OctaneNode;
	kind: string;
	caseValue: OctaneNode;
	defaultValue: OctaneNode;
	outer: boolean;
	inner: string;
	nestedValue: OctaneNode;
}

export function DirectiveMatrix(props: DirectiveMatrixProps) @{
	<main id="directive-matrix">
		<section id="if-expression-arm">
			@if (props.on) {
				props.ifOn;
			} @else {
				props.ifOff;
			}
		</section>
		<section id="else-if-expression-arm">
			@if (props.elseIfBranch === 'first') {
				props.elseIfFirst;
			} @else if (props.elseIfBranch === 'second') {
				props.elseIfSecond;
			} @else {
				props.elseIfFallback;
			}
		</section>
		<section id="for-expression-arm">
			@for (const item of props.items; key item.id) {
				item.value;
			} @empty {
				props.emptyValue;
			}
		</section>
		<section id="switch-expression-arm">
			@switch (props.kind) {
				@case 'case': {
					props.caseValue;
				}
				@default: {
					props.defaultValue;
				}
			}
		</section>
		<section id="nested-expression-arm">
			@if (props.outer) {
				@switch (props.inner) {
					@case 'match': {
						props.nestedValue;
					}
					@default: {
						null;
					}
				}
			} @else {
				null;
			}
		</section>
	</main>
}

export function OnceExpressionArm(props: {
	on: boolean;
	read: () => OctaneNode;
}) @{
	<section id="once-expression-arm">
		@if (props.on) {
			props.read();
		} @else {
			null;
		}
	</section>
}

export function MultiStatementSetupArm(props: {
	on: boolean;
	observe: () => void;
	value: OctaneNode;
}) @{
	<section id="multi-statement-arm">
		@if (props.on) {
			props.observe();
			props.value;
		}
	</section>
}

export type TryMode = 'success' | 'pending' | 'error';

function TryChild(props: {
	mode: TryMode;
	promise?: Promise<string>;
	label: string;
}) @{
	if (props.mode === 'error') throw new Error('try boom');
	const label =
		props.mode === 'pending' ? use(props.promise as Promise<string>) : props.label;
	<button id="try-success-arm">{label}</button>
}

export function TryExpressionArms(props: {
	mode: TryMode;
	promise?: Promise<string>;
	label: string;
}) @{
	<section id="try-expression-arms">
		@try {
			createElement(TryChild, props);
		} @pending {
			createElement('span', { id: 'try-pending-arm' }, 'pending');
		} @catch (error: unknown) {
			createElement(
				'span',
				{ id: 'try-catch-arm' },
				'caught:' + (error instanceof Error ? error.message : String(error)),
			);
		}
	</section>
}
