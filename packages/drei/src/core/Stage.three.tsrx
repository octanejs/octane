/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements } from '@octanejs/three';
import { useCallback, useEffect, useState } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import { AccumulativeShadows, type AccumulativeShadowsProps, RandomizedLight, type RandomizedLightProps } from './AccumulativeShadows.three.tsrx';
import { Bounds, useBounds } from './Bounds.three.tsrx';
import { Center, type CenterProps, type OnCenterCallbackProps } from './Center.three.tsrx';
import { ContactShadows, type ContactShadowsProps } from './ContactShadows.three.tsrx';
import { Environment, type EnvironmentProps } from './Environment.three.tsrx';

const presets = {
	rembrandt: { main: [1, 2, 1], fill: [-2, -0.5, -2] },
	portrait: { main: [-1, 2, 0.5], fill: [-1, 0.5, -1.5] },
	upfront: { main: [0, 2, 1], fill: [-1, 0.5, -1.5] },
	soft: { main: [-2, 4, 4], fill: [-1, 0.5, -1.5] },
} satisfies Record<string, { main: [number, number, number]; fill: [number, number, number] }>;

type StageShadows = Partial<AccumulativeShadowsProps> & Partial<RandomizedLightProps> & Partial<ContactShadowsProps> & {
	type: 'contact' | 'accumulative';
	offset?: number;
	bias?: number;
	normalBias?: number;
	size?: number;
};

export type StageProps = Omit<ThreeElements['group'], 'ref'> & {
	preset?: keyof typeof presets | { main: [number, number, number]; fill: [number, number, number] };
	shadows?: boolean | 'contact' | 'accumulative' | StageShadows;
	adjustCamera?: boolean | number;
	environment?: NonNullable<EnvironmentProps['preset']> | Partial<EnvironmentProps> | null;
	intensity?: number;
	center?: Partial<CenterProps>;
	children?: OctaneNode;
};

function Refit({ radius, adjustCamera }: { radius: number; adjustCamera: boolean | number }) @{
	const api = useBounds();
	useEffect(() => {
		if (adjustCamera) api.refresh().clip().fit();
	}, [radius, adjustCamera]);
	null
}

export function Stage({
	children,
	center,
	adjustCamera = true,
	intensity = 0.5,
	shadows = 'contact',
	environment = 'city',
	preset = 'rembrandt',
	...props
}: StageProps) @{
	const config = typeof preset === 'string' ? presets[preset] : preset;
	const [dimensions, setDimensions] = useState({ radius: 0, width: 0, height: 0, depth: 0 });
	const { radius, height } = dimensions;
	const shadowConfig = typeof shadows === 'object' ? shadows : undefined;
	const shadowBias = shadowConfig?.bias ?? -0.0001;
	const normalBias = shadowConfig?.normalBias ?? 0;
	const shadowSize = shadowConfig?.size ?? 1024;
	const shadowOffset = shadowConfig?.offset ?? 0;
	const contactShadow = shadows === 'contact' || shadowConfig?.type === 'contact';
	const accumulativeShadow = shadows === 'accumulative' || shadowConfig?.type === 'accumulative';
	const shadowSpread = shadowConfig ?? {};
	const environmentProps = !environment ? null : typeof environment === 'string' ? { preset: environment } : environment;
	const onCentered = useCallback((centered: OnCenterCallbackProps) => {
		const { width, height: nextHeight, depth, boundingSphere } = centered;
		setDimensions({ radius: boundingSphere.radius, width, height: nextHeight, depth });
		center?.onCentered?.(centered);
	}, []);
	<>
		<ambientLight intensity={intensity / 3} />
		<spotLight
			penumbra={1}
			position={[config.main[0] * radius, config.main[1] * radius, config.main[2] * radius]}
			intensity={intensity * 2}
			castShadow={Boolean(shadows)}
			shadow-bias={shadowBias}
			shadow-normalBias={normalBias}
			shadow-mapSize={shadowSize}
		/>
		<pointLight position={[config.fill[0] * radius, config.fill[1] * radius, config.fill[2] * radius]} intensity={intensity} />
		<Bounds fit={Boolean(adjustCamera)} clip={Boolean(adjustCamera)} margin={Number(adjustCamera)} observe {...props}>
			<Refit radius={radius} adjustCamera={adjustCamera} />
			<Center {...center} position={[0, shadowOffset / 2, 0]} onCentered={onCentered}>
				{children}
			</Center>
		</Bounds>
		<group position={[0, -height / 2 - shadowOffset / 2, 0]} name="stage-shadows">
			@if (contactShadow) {
				<ContactShadows scale={radius * 4} far={radius} blur={2} {...shadowSpread as ContactShadowsProps} />
			}
			@if (accumulativeShadow) {
				<AccumulativeShadows temporal frames={100} alphaTest={0.9} toneMapped scale={radius * 4} {...shadowSpread as AccumulativeShadowsProps}>
					<RandomizedLight
						amount={(shadowSpread as RandomizedLightProps).amount ?? 8}
						radius={(shadowSpread as RandomizedLightProps).radius ?? radius}
						ambient={(shadowSpread as RandomizedLightProps).ambient ?? 0.5}
						intensity={(shadowSpread as RandomizedLightProps).intensity ?? 1}
						position={[config.main[0] * radius, config.main[1] * radius, config.main[2] * radius]}
						size={radius * 4}
						bias={-shadowBias}
						mapSize={shadowSize}
					/>
				</AccumulativeShadows>
			}
		</group>
		@if (environmentProps) {
			<Environment {...environmentProps} />
		}
	</>
}
