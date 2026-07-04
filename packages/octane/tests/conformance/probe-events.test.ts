// TEMPORARY probe — will be deleted.
import { describe, it, expect } from 'vitest';
import { mount, createLog } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	NonBubbling,
	InvalidBubbles,
	ScrollTree,
	ThrowingChain,
	BadListener,
	CaptureNonBubbling,
} from './_fixtures/probe-events.tsrx';

describe('probe', () => {
	it('non-bubbling toggle/play/close delivery', () => {
		const log = createLog();
		const r = mount(NonBubbling, { log: log.push });
		r.find('.det').dispatchEvent(new Event('toggle', { bubbles: false }));
		r.find('.vid').dispatchEvent(new Event('play', { bubbles: false }));
		r.find('.dlg').dispatchEvent(new Event('close', { bubbles: false }));
		console.log('NONBUBBLING LOG:', JSON.stringify(log.drain()));
		r.unmount();
	});

	it('invalid bubbles emulated', () => {
		const log = createLog();
		const r = mount(InvalidBubbles, { log: log.push });
		r.find('.inp').dispatchEvent(new Event('invalid', { bubbles: false }));
		console.log('INVALID LOG:', JSON.stringify(log.drain()));
		r.unmount();
	});

	it('scroll capture + bubble ordering', () => {
		const log = createLog();
		const r = mount(ScrollTree, { log: log.push });
		r.find('.child').dispatchEvent(new Event('scroll', { bubbles: false }));
		console.log('SCROLL LOG:', JSON.stringify(log.drain()));
		r.unmount();
	});

	it('throwing handler mid-chain', () => {
		const log = createLog();
		const r = mount(ThrowingChain, { log: log.push });
		let threw: any = null;
		try {
			(r.find('.c') as HTMLElement).click();
		} catch (e) {
			threw = e;
		}
		console.log('THROW LOG:', JSON.stringify(log.drain()), 'threw:', String(threw));
		r.unmount();
	});

	it('string listener', () => {
		const log = createLog();
		const r = mount(BadListener, { log: log.push, bad: 'not a function' });
		let threw: any = null;
		try {
			flushSync(() => (r.find('.target') as HTMLElement).click());
		} catch (e) {
			threw = e;
		}
		console.log('BAD LOG:', JSON.stringify(log.drain()), 'threw:', String(threw));
		r.unmount();
	});

	it('null listener', () => {
		const log = createLog();
		const r = mount(BadListener, { log: log.push, bad: null });
		let threw: any = null;
		try {
			flushSync(() => (r.find('.target') as HTMLElement).click());
		} catch (e) {
			threw = e;
		}
		console.log('NULL LOG:', JSON.stringify(log.drain()), 'threw:', String(threw));
		r.unmount();
	});

	it('capture-phase non-bubbling play', () => {
		const log = createLog();
		const r = mount(CaptureNonBubbling, { log: log.push });
		r.find('.inner').dispatchEvent(new Event('play', { bubbles: false }));
		r.find('.outer').dispatchEvent(new Event('play', { bubbles: false }));
		console.log('CAPTURE LOG:', JSON.stringify(log.drain()));
		r.unmount();
	});
});
