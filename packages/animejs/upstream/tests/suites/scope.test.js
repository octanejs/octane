import {
  expect,
} from '../utils.js';

import {
  createScope,
} from '../../dist/modules/index.js';

suite('Scope', () => {

  test('Default to global root with no params', () => {
    const $root = document;
    const scope = createScope();
    expect(scope.root).to.equal($root);
  });

  test('Default to global root with non existing selector', () => {
    const $root = document;
    const scope = createScope({ root: '#i-dont-exit' });
    expect(scope.root).to.equal($root);
  });

  test('Default to global root with undefined selector', () => {
    const $root = document;
    const scope = createScope({ root: undefined });
    expect(scope.root).to.equal($root);
  });

  test('DOM root', () => {
    const $root = document.querySelector('#stagger-tests');
    const scope = createScope({ root: '#stagger-tests' });
    expect(scope.root).to.equal($root);
  });

  test('React ref root', () => {
    const $root = /** @type {HTMLElement} */(document.querySelector('#stagger-tests'));
    const ref = { current: $root };
    const scope = createScope({ root: ref });
    expect(scope.root).to.equal($root);
  });

  test('Angular ref root', () => {
    const $root = /** @type {HTMLElement} */(document.querySelector('#stagger-tests'));
    const ref = { nativeElement: $root };
    const scope = createScope({ root: ref });
    expect(scope.root).to.equal($root);
  });

});
