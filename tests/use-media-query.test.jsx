// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/preact';
import { useMediaQuery } from '../src/hooks/useMediaQuery.js';

afterEach(() => cleanup());

function Probe({ query }) {
  return <div>{useMediaQuery(query) ? 'matches' : 'no'}</div>;
}

// Controllable matchMedia: captures the change listener so a test can drive it
function installMatchMedia(initial) {
  const listeners = new Set();
  const mq = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: (type, cb) => { if (type === 'change') listeners.add(cb); },
    removeEventListener: (type, cb) => { if (type === 'change') listeners.delete(cb); },
    dispatchEvent: () => false,
  };
  const real = window.matchMedia;
  window.matchMedia = () => mq;
  return {
    fire: matches => { mq.matches = matches; for (const cb of [...listeners]) cb({ matches }); },
    subscribed: () => listeners.size,
    restore: () => { window.matchMedia = real; },
  };
}

describe('useMediaQuery', () => {
  it('reads the initial state and follows change events', () => {
    const mq = installMatchMedia(false);
    render(<Probe query="(max-width: 600px)" />);
    expect(screen.getByText('no')).toBeInTheDocument();

    act(() => mq.fire(true));
    expect(screen.getByText('matches')).toBeInTheDocument();

    act(() => mq.fire(false));
    expect(screen.getByText('no')).toBeInTheDocument();
    mq.restore();
  });

  it('unsubscribes from the media query on unmount', () => {
    const mq = installMatchMedia(false);
    render(<Probe query="(prefers-color-scheme: dark)" />);
    expect(mq.subscribed()).toBe(1);
    cleanup();
    expect(mq.subscribed()).toBe(0);
    mq.restore();
  });
});