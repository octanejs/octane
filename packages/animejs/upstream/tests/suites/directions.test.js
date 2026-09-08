import {
  expect,
} from '../utils.js';

import {
  animate,
  utils,
} from '../../dist/modules/index.js';

suite('Directions', () => {
  test('Direction normal should update from 0 to 1', resolve => {
    const [ target ] = utils.$('#target-id');
    const animation = animate(target, {
      translateX: 100,
      duration: 10,
      onComplete: () => {
        expect(target.style.transform).to.equal('translateX(100px)');
        resolve();
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(0px)');
  });

  test('Direction reverse should update from 1 to 0', resolve => {
    const [ target ] = utils.$('#target-id');
    const animation = animate(target, {
      translateX: 100,
      reversed: true,
      duration: 10,
      onComplete: () => {
        expect(target.style.transform).to.equal('translateX(0px)');
        resolve();
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(100px)');
  });

  test('Manually reversed infinite animation should update', resolve => {
    const [ target ] = utils.$('#target-id');
    let loopCounts = 0;
    const animation = animate(target, {
      translateX: 100,
      reversed: false,
      loop: true,
      duration: 20,
      onLoop: self => {
        loopCounts++;
        if (loopCounts === 2) {
          self.pause();
          expect(loopCounts).to.equal(2);
          expect(self.currentTime).to.be.at.least(40);
          expect(self.paused).to.equal(true);
          resolve();
        }
      },
    });
    animation.reverse();
  });

  test('Direction alternate should update from 0 to 1 when no loop parameter is specified', resolve => {
    const [ target ] = utils.$('#target-id');
    const animation = animate(target, {
      translateX: 100,
      alternate: true,
      duration: 10,
      onComplete: () => {
        expect(target.style.transform).to.equal('translateX(100px)');
        resolve();
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(0px)');
  });

  test('Direction alternate should update from 0 to 1 then 1 to 0 when a loop parameter is specified', resolve => {
    const [ target ] = utils.$('#target-id');
    const animation = animate(target, {
      translateX: 100,
      alternate: true,
      duration: 10,
      loop: 3,
      onComplete: () => {
        expect(target.style.transform).to.equal('translateX(0px)');
        resolve();
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(0px)');
  });

  test('Infinite loop with direction alternate should update from 0 to 1 then 1 to 0...', resolve => {
    const [ target ] = utils.$('#target-id');
    let loopCounts = 0;
    const animation = animate(target, {
      translateX: 100,
      alternate: true,
      duration: 50,
      ease: 'linear',
      loop: Infinity,
      onLoop: self => {
        loopCounts++;
        if (loopCounts === 4) {
          // Infinite loop onLoop events don't garanty rounded number since they're still in the middle of the animation
          expect(parseFloat(utils.get(target, 'translateX'))).to.be.below(50);
          self.pause();
          resolve();
        }
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(0px)');
  });

  test('Direction alternate reverse should update from 1 to 0 when no loop parameter is specified', resolve => {
    const [ target ] = utils.$('#target-id');
    const animation = animate(target, {
      translateX: 100,
      alternate: true,
      reversed: true,
      duration: 10,
      onComplete: () => {
        expect(target.style.transform).to.equal('translateX(0px)');
        resolve();
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(100px)');
  });

  test('Direction alternate reverse should update from 1 to 0 then 0 to 1 when a loop parameter is specified', resolve => {
    const [ target ] = utils.$('#target-id');
    const animation = animate(target, {
      translateX: 100,
      // direction: 'alternate-reverse',
      alternate: true,
      reversed: true,
      duration: 10,
      loop: 3,
      onComplete: () => {
        expect(target.style.transform).to.equal('translateX(100px)');
        resolve();
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(100px)');
  });

  test('Infinite loop with direction alternate reverse should update from 1 to 0 then 0 to 1...', resolve => {
    const [ target ] = utils.$('#target-id');
    let loopCounts = 0;
    const animation = animate(target, {
      translateX: 100,
      // direction: 'alternate-reverse',
      alternate: true,
      reversed: true,
      duration: 50,
      loop: Infinity,
      onLoop: self => {
        loopCounts++;
        if (loopCounts === 4) {
          // Infinite loop onLoop events don't garanty rounded number since they're still in the middle of the animation
          expect(parseFloat(utils.get(target, 'translateX'))).to.be.above(50);
          self.pause();
          resolve();
        }
      },
    });
    animation.seek(0);
    expect(target.style.transform).to.equal('translateX(100px)');
  });

});
