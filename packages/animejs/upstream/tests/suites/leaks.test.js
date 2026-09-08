import {
  expect, forEachChildren,
} from '../utils.js';

import {
  engine,
} from '../../dist/modules/index.js';

suite('Leaks', () => {
  test('Engine should not contain any active tickable', resolve => {
    setTimeout(() => {
      forEachChildren(engine, child => {
        console.warn('Active child id:', child.id);
      });
      expect(engine._tail).to.equal(null);
      resolve();
    }, 10)
  });
});