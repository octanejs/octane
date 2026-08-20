import React from 'react';
import RiveComponent from '../src/components/Rive';
import { render } from '@testing-library/react';

jest.mock('@rive-app/canvas', () => ({
  Rive: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    stop: jest.fn(),
    cleanup: jest.fn(),
  })),
  Layout: jest.fn(),
  Fit: {
    Cover: 'cover',
  },
  Alignment: {
    Center: 'center',
  },
  EventType: {
    Load: 'load',
  },
  StateMachineInputType: {
    Number: 1,
    Boolean: 2,
    Trigger: 3,
  },
}));

describe('Rive Component', () => {
  it('renders the component as a canvas and a div wrapper', () => {
    const { container, getByLabelText } = render(
      <RiveComponent
        src="foo.riv"
        className="container-styles"
        aria-label="Foo label"
      />
    );
    expect(container.firstChild).toHaveClass('container-styles');
    expect(getByLabelText('Foo label').tagName).toEqual('CANVAS');
  });

  it('allows children to render in the canvas body', () => {
    const accessibleFallbackText = 'An animated test';
    const { getByText } = render(
      <RiveComponent
        src="foo.riv"
        className="container-styles"
        aria-label="Foo label"
      >
        <p>{accessibleFallbackText}</p>
      </RiveComponent>
    );

    expect(getByText(accessibleFallbackText)).not.toBeNull();
  });
});
