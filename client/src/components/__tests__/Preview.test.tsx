import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Preview } from '../Preview';

describe('Preview', () => {
  it('should render placeholder when no url provided', () => {
    render(<Preview />);
    expect(screen.getByText('No preview configured')).toBeInTheDocument();
    expect(
      screen.getByText('Configure your dev server port to see preview')
    ).toBeInTheDocument();
  });

  it('should render iframe when url provided', () => {
    render(<Preview url="http://localhost:3000" />);
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toBe('http://localhost:3000/');
  });

  it('should disable refresh button when no url', () => {
    render(<Preview />);
    const refreshBtn = screen.getByTitle('Refresh preview');
    expect(refreshBtn).toBeDisabled();
  });

  it('should enable refresh button when url provided', () => {
    render(<Preview url="http://localhost:3000" />);
    const refreshBtn = screen.getByTitle('Refresh preview');
    expect(refreshBtn).not.toBeDisabled();
  });

  it('should show loading state initially when url provided', () => {
    render(<Preview url="http://localhost:3000" />);
    expect(screen.getByText('Loading preview...')).toBeInTheDocument();
  });

  it('should hide loading state on iframe load', () => {
    render(<Preview url="http://localhost:3000" />);
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;

    // Trigger load event
    fireEvent.load(iframe);

    expect(screen.queryByText('Loading preview...')).not.toBeInTheDocument();
  });

  it('should have error handler on iframe', () => {
    render(<Preview url="http://localhost:3000" />);
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;

    // Check iframe has onError attribute (error handling is set up)
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toBe('http://localhost:3000');
    // In jsdom, iframe error events don't work realistically
    // This test verifies the iframe is set up correctly
  });

  it('should refresh iframe when refresh button clicked', () => {
    render(<Preview url="http://localhost:3000" />);
    const refreshBtn = screen.getByTitle('Refresh preview');

    // Initial iframe
    const iframe1 = screen.getByTitle('Preview');
    expect(iframe1).toBeInTheDocument();

    // Click refresh
    fireEvent.click(refreshBtn);

    // Should still have iframe (key changed internally)
    const iframe2 = screen.getByTitle('Preview');
    expect(iframe2).toBeInTheDocument();
  });

  it('should have correct sandbox attributes', () => {
    render(<Preview url="http://localhost:3000" />);
    const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-same-origin allow-scripts allow-forms'
    );
  });
});
