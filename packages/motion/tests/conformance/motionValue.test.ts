import { describe, it, expect } from 'vitest';
import { motionValue } from 'motion';
import { mount, nextPaint } from '../_helpers';
import { MVBox } from '../_fixtures/mv.tsrx';
import { StyleXLater } from '../_fixtures/style-rebind.tsrx';
import { StyleOpacity } from '../_fixtures/style-opacity.tsrx';
import { StyleXY } from '../_fixtures/style-xy.tsrx';
import { removeTransformFn, patchTransformFn } from '../../src/useMotionValue';

describe('useMotionValue', function useMotionValueSuite() {
	it('binds a MotionValue to style and updates the element without a re-render', async function bindsWithoutRerender() {
		let x: any;
		const r = mount(MVBox, {
			onReady: function onReady(mv: any) {
				x = mv;
			},
		});
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toContain('translateX(0px)'); // initial
		x.set(120);
		await nextPaint();
		expect(div.style.transform).toContain('translateX(120px)'); // updated via subscription
		r.unmount();
	});

	it('keeps foreign transforms when a style MotionValue is bound later', async function keepsForeignTransformOnRebind() {
		const r = mount(StyleXLater, {});
		await nextPaint();
		const div = r.find('#box');
		// Simulate animate/layout/drag having written a transform before style bind.
		div.style.transform = 'scale(2)';

		const x = motionValue(40);
		r.update(StyleXLater, { x });
		await nextPaint();
		expect(div.style.transform).toBe('translateX(40px) scale(2)');
		r.unmount();
	});

	it('patches layout FLIP compound translate instead of stacking translateX', async function patchesLayoutCompoundTranslate() {
		const r = mount(StyleXLater, {});
		await nextPaint();
		const div = r.find('#box');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';

		const x = motionValue(40);
		r.update(StyleXLater, { x });
		await nextPaint();
		expect(div.style.transform).toBe('translateX(40px) translateY(-50px) scale(1.2, 0.8)');
		expect(div.style.transform).not.toContain('translate(');
		r.unmount();
	});

	it('keeps a sibling axis MotionValue when patching over layout FLIP', async function keepsSiblingAxisOverLayoutFlip() {
		const x = motionValue(10);
		const y = motionValue(20);
		const r = mount(StyleXY, { x, y });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toBe('translateX(10px) translateY(20px)');

		// Layout FLIP overwrites the live string with a compound form.
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		x.set(40);
		await nextPaint();
		expect(div.style.transform).toBe('translateX(40px) translateY(20px) scale(1.2, 0.8)');
		r.unmount();
	});

	it('prefers transformState sibling axes when decomposing compound translate', function prefersTransformStateSiblings() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px)';
		patchTransformFn(div, 'x', 40, { x: 10, y: 20 });
		expect(div.style.transform).toBe('translateX(40px) translateY(20px)');
	});

	it('leaves asymmetric layout FLIP scale alone when binding uniform scale', function leavesAsymmetricFlipScaleOnUniformScale() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		patchTransformFn(div, 'scale', 2);
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1.2, 0.8)');
	});

	it('replaces uniform two-arg scale when binding style scale', function replacesUniformTwoArgScale() {
		const div = document.createElement('div');
		div.style.transform = 'scale(1, 1)';
		patchTransformFn(div, 'scale', 2);
		expect(div.style.transform).toBe('scale(2)');
	});

	it('decomposes asymmetric FLIP scale when binding scaleX', function decomposesAsymmetricFlipOnScaleX() {
		const div = document.createElement('div');
		div.style.transform = 'scale(1.2, 0.8)';
		patchTransformFn(div, 'scaleX', 2);
		expect(div.style.transform).toBe('scaleX(2) scaleY(0.8)');
	});

	it('clears a decomposed axis on unbind after binding over layout FLIP', function clearsDecomposedAxisOnUnbind() {
		const div = document.createElement('div');
		div.style.transform = 'translate(0px, 0px) scale(1, 1)';
		patchTransformFn(div, 'x', 40);
		expect(div.style.transform).toBe('translateX(40px) translateY(0px) scale(1, 1)');
		removeTransformFn(div, 'x');
		expect(div.style.transform).toBe('translateY(0px) scale(1, 1)');
	});

	it('leaves layout FLIP compound translate alone when unbinding x', function leavesLayoutCompoundOnUnbind() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		removeTransformFn(div, 'x');
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1.2, 0.8)');
		div.style.transform = 'translateX(40px) scale(2)';
		removeTransformFn(div, 'x');
		expect(div.style.transform).toBe('scale(2)');
	});

	it('leaves layout FLIP compound scale alone when unbinding scale', function leavesLayoutCompoundScaleOnUnbind() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		removeTransformFn(div, 'scale');
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1.2, 0.8)');
		div.style.transform = 'translate(-50px, -50px) scale(1, 1)';
		removeTransformFn(div, 'scale');
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1, 1)');
		div.style.transform = 'translateX(40px) scale(2)';
		removeTransformFn(div, 'scale');
		expect(div.style.transform).toBe('translateX(40px)');
	});

	it('keeps plain static styles when a MotionValue style key becomes static', async function keepsStaticAfterMotionValue() {
		const opacity = motionValue(0.2);
		const r = mount(StyleOpacity, { style: { opacity } });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.opacity).toBe('0.2');

		r.update(StyleOpacity, { style: { opacity: 0.75 } });
		await nextPaint();
		expect(div.style.opacity).toBe('0.75');
		r.unmount();
	});

	it('patches and removes nested calc() transform values', async function nestedCalcTransformValues() {
		const x = motionValue('calc(100% - 10px)');
		const r = mount(StyleXLater, { x });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toContain('translateX(calc(100% - 10px))');

		x.set('calc(50% + 4px)');
		await nextPaint();
		expect(div.style.transform).toBe('translateX(calc(50% + 4px))');

		r.update(StyleXLater, {});
		await nextPaint();
		expect(div.style.transform).toBe('');
		r.unmount();
	});
});
