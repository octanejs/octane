import {
  expect,
  getChildAtIndex,
} from '../utils.js';

import {
  animate,
  utils
} from '../../dist/modules/index.js';

suite('Timings', () => {
  test('Specified timings parameters', resolve => {
    animate('#target-id', {
      translateX: 100,
      delay: 10,
      duration: 20,
      loop: 1,
      loopDelay: 10,
      onComplete: a => {
        expect(a.currentTime).to.equal(20 + 10 + 20);
        resolve();
      },
    });
  });

  const complexTimingsParams = {
    translateX: {
      to: 50,
      delay: () => 15,
      duration: () => 10,
    },
    translateY: {
      to: 35,
      delay: 10,
      duration: 10,
    },
    translateZ: {
      to: 20,
      delay: 35,
      duration: 30,
    },
    delay: () => 10,
    duration: () => 10,
    loopDelay: 10,
    loop: 1,
    autoplay: false
  };

  test('Iteration currentTime should be negative when a delay is defined', () => {
    const animation = animate('#target-id', complexTimingsParams);
    expect(animation.currentTime).to.equal(-10);
    animation.seek(5)
    expect(animation.currentTime).to.equal(5);
    animation.seek(animation.duration)
    expect(animation.currentTime).to.equal(animation.duration);
  });

  test('Duration must be equal to the highest tween end value minus the delay', () => {
    const animation = animate('#target-id', complexTimingsParams);
    expect(animation.duration).to.equal(55 + 10 + 55);
  });

  test('IterationChangeEndTime must be equal to the highest iterationChangeEndTime of the the longest tween minus the delay', () => {
    const animation = animate('#target-id', complexTimingsParams);
    expect(animation.iterationDuration).to.equal(65 - 10);
  });

  test('Delay should delay the start of the animation', resolve => {
    const start = Date.now();
    const animation = animate('#target-id', {
      x: 100,
      delay: 100,
      duration: 100,
      ease: 'linear',
      onBegin: self => {
        self.pause();
        const current = Date.now() - start;
        expect(current).to.be.closeTo(100, 17);
        expect(utils.get('#target-id', 'x', false)).to.equal(0);
        animation.seek(50);
        expect(utils.get('#target-id', 'x', false)).to.equal(50);
        animation.seek(100);
        expect(utils.get('#target-id', 'x', false)).to.equal(100);
        resolve();
      }
    });
  });

  test('Delayed alternate looped animations should start correctly', () => {
    animate('#target-id', {
      y: -100,
      loop: 2,
      delay: 1000,
      alternate: true,
      autoplay: false,
    });
    expect(utils.get('#target-id', 'y', false)).to.equal(0);
  });

  test('Negative delay on alternate looped animations should render the value in advance', () => {
    const animation = animate('#target-id', {
      scale: [0, 1],
      ease: 'linear',
      loop: true,
      duration: 1000,
      delay: -5250,
      alternate: true,
      autoplay: false,
    });
    animation.seek(0);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.75)
  });

  test('Get and set iterationProgress on non looped animation', () => {
    const animation = animate('#target-id', {
      scale: [0, 1],
      ease: 'linear',
      duration: 1000,
      autoplay: false
    });
    animation.iterationProgress = 0;
    expect(utils.get('#target-id', 'scale', false)).to.equal(0);
    animation.iterationProgress = .5;
    expect(utils.get('#target-id', 'scale', false)).to.equal(.5);
    animation.iterationProgress = 1;
    expect(utils.get('#target-id', 'scale', false)).to.equal(1);
    expect(animation.currentTime).to.equal(1000);
  });

  test('Get and set iterationProgress on a looped animation with pre-defined iterations', () => {
    const animation = animate('#target-id', {
      scale: [0, 1],
      ease: 'linear',
      duration: 1000,
      autoplay: false,
      loop: 3,
    });
    animation.seek(2200);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.2);
    animation.iterationProgress = 0;
    expect(animation.currentTime).to.equal(2000);
    expect(utils.get('#target-id', 'scale', false)).to.equal(0);
    animation.iterationProgress = .5;
    expect(utils.get('#target-id', 'scale', false)).to.equal(.5);
    animation.iterationProgress = 1;
    expect(utils.get('#target-id', 'scale', false)).to.equal(0);
    expect(animation.currentTime).to.equal(3000);
  });

  test('Get and set currentIteration on a looped animation with pre-defined iterations', () => {
    const animation = animate('#target-id', {
      scale: [0, 1],
      ease: 'linear',
      duration: 1000,
      autoplay: false,
      loop: 4,
    });
    animation.currentIteration = 0;
    expect(animation.currentIteration).to.equal(0);
    animation.seek(1500);
    expect(animation.currentIteration).to.equal(1);
    animation.currentIteration = 2;
    expect(animation.currentIteration).to.equal(2);
    expect(animation.currentTime).to.equal(2000);
    animation.currentIteration = 99;
    expect(animation.currentIteration).to.equal(4);
    expect(animation.currentTime).to.equal(4000);
  });

  test('Get and set currentTime on a looped animation with pre-defined iterations', () => {
    const animation = animate('#target-id', {
      scale: [0, 1],
      ease: 'linear',
      duration: 1000,
      autoplay: false,
      loop: 4,
    });
    animation.currentTime = 1500;
    expect(animation.currentTime).to.equal(1500);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.5);
    animation.currentTime = 4250;
    expect(animation.currentTime).to.equal(4250);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.25);
    animation.currentTime = 5500;
    expect(animation.currentTime).to.equal(5000);
    expect(utils.get('#target-id', 'scale', false)).to.equal(1);
  });

  test('Get and set iterationCurrentTime on a looped animation with pre-defined iterations', () => {
    const animation = animate('#target-id', {
      scale: [0, 1],
      ease: 'linear',
      duration: 1000,
      autoplay: false,
      loop: 4,
    });
    animation.iterationCurrentTime = 500;
    expect(animation.currentTime).to.equal(500);
    expect(animation.currentIteration).to.equal(0);
    expect(animation.iterationCurrentTime).to.equal(500);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.5);
    animation.iterationCurrentTime = 1500;
    expect(animation.currentTime).to.equal(1500);
    expect(animation.currentIteration).to.equal(1);
    expect(animation.iterationCurrentTime).to.equal(500);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.5);
    animation.iterationCurrentTime = 250;
    expect(animation.currentTime).to.equal(1250);
    expect(animation.currentIteration).to.equal(1);
    expect(animation.iterationCurrentTime).to.equal(250);
    expect(utils.get('#target-id', 'scale', false)).to.equal(.25);
  });

  test('Get and set cancelled on an animation', () => {
    const animation = animate('#target-id', complexTimingsParams);
    expect(animation.cancelled).to.equal(false);
    animation.cancelled = true;
    expect(animation.cancelled).to.equal(true);
    expect(animation.paused).to.equal(true);
    animation.cancelled = false;
    expect(animation.cancelled).to.equal(false);
    expect(animation.paused).to.equal(false);
  });
});
