/**
 * Test for App component
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../index';

describe('App Component', () => {
  it('should render the app', () => {
    render(<App />);
    expect(screen.getByText('Hello, Claude Studio Client!')).toBeInTheDocument();
  });

  it('should render an h1 element', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Hello, Claude Studio Client!');
  });
});
