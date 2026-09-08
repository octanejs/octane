import {
  expect,
} from '../utils.js';

import { animate, createTimeline, createTimer, utils } from '../../dist/modules/index.js';

suite('Promises', () => {

  test('then() on timer', resolve => {
    createTimer({ duration: 30 }).then(anim => {
      expect(anim.currentTime).to.equal(30);
      resolve();
    });
  });

  test('then() on animation', resolve => {
    animate('#target-id', {
      y: 100,
      duration: 30,
    })
    .then(anim => {
      expect(anim.currentTime).to.equal(30);
      resolve();
    });
  });

  test('then() on timeline', resolve => {
    createTimeline()
    .add('#target-id', {
      x: 100,
      duration: 15,
    })
    .add('#target-id', {
      y: 100,
      duration: 15,
    })
    .then(tl => {
      expect(tl.currentTime).to.equal(30);
      resolve();
    });
  });

  test('Use a timer as a return value in an async function', resolve => {
    async function doSomethingAsync() {
      async function wait30ms() {
        return /** @type {Promise} */(/** @type {unknown} */(createTimer({ duration: 30 })));
      }
      const asyncTimer = await wait30ms();
      expect(asyncTimer.currentTime).to.equal(30);
      resolve();
    }
    doSomethingAsync();
  });

});
