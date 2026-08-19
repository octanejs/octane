// Load Testing Library at suite setup time. Upstream utils re-export the full
// package and some suites require() that helper inside beforeEach; Jest Circus
// rejects afterAll registration once a test body has started.
require('@testing-library/react');
require('../upstream/test/setupAfterEnv.js');
