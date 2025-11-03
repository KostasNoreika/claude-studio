/**
 * Sample test to verify Vitest and React Testing Library configuration
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

// Simple test component
const TestComponent = ({ name }: { name: string }) => {
  return <div data-testid="greeting">Hello, {name}!</div>;
};

describe('Sample Test Suite', () => {
  describe('basic assertions', () => {
    it('should pass a simple test', () => {
      expect(true).toBe(true);
    });

    it('should perform arithmetic operations', () => {
      expect(2 + 2).toBe(4);
      expect(10 - 5).toBe(5);
      expect(3 * 4).toBe(12);
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3];
      expect(arr).toHaveLength(3);
      expect(arr).toContain(2);
    });
  });

  describe('React component rendering', () => {
    it('should render a component', () => {
      render(<TestComponent name="World" />);
      const element = screen.getByTestId('greeting');
      expect(element).toBeInTheDocument();
    });

    it('should render with props', () => {
      render(<TestComponent name="Testing" />);
      expect(screen.getByText('Hello, Testing!')).toBeInTheDocument();
    });

    it('should handle different props', () => {
      const { rerender } = render(<TestComponent name="First" />);
      expect(screen.getByText('Hello, First!')).toBeInTheDocument();

      rerender(<TestComponent name="Second" />);
      expect(screen.getByText('Hello, Second!')).toBeInTheDocument();
    });
  });

  describe('async operations', () => {
    it('should handle promises', async () => {
      const promise = Promise.resolve('success');
      await expect(promise).resolves.toBe('success');
    });

    it('should handle async/await', async () => {
      const asyncFunction = async () => {
        return 'async result';
      };
      const result = await asyncFunction();
      expect(result).toBe('async result');
    });
  });
});
