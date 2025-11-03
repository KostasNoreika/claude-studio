/**
 * Sample test to verify Jest configuration
 */

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

    it('should handle objects', () => {
      const obj = { name: 'test', value: 42 };
      expect(obj).toHaveProperty('name');
      expect(obj.name).toBe('test');
      expect(obj).toEqual({ name: 'test', value: 42 });
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

  describe('mocking', () => {
    it('should mock functions', () => {
      const mockFn = jest.fn((x: number) => x * 2);
      expect(mockFn(5)).toBe(10);
      expect(mockFn).toHaveBeenCalledWith(5);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should mock return values', () => {
      const mockFn = jest.fn();
      mockFn.mockReturnValue('mocked');
      expect(mockFn()).toBe('mocked');
    });
  });
});
