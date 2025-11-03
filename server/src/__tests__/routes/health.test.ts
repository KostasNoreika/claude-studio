import request from 'supertest';
import app from '../../app';

describe('GET /api/health', () => {
  it('should return 200 status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });

  it('should return JSON with status ok', async () => {
    const response = await request(app).get('/api/health');
    expect(response.body).toHaveProperty('status', 'ok');
  });

  it('should return valid ISO8601 timestamp', async () => {
    const response = await request(app).get('/api/health');
    expect(response.body).toHaveProperty('timestamp');

    const timestamp = response.body.timestamp;
    const date = new Date(timestamp);

    // Verify it's a valid date
    expect(date.toString()).not.toBe('Invalid Date');

    // Verify ISO8601 format (roundtrip test)
    expect(date.toISOString()).toBe(timestamp);
  });

  it('should have correct content-type', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  it('should return timestamp close to current time', async () => {
    const beforeRequest = new Date();
    const response = await request(app).get('/api/health');
    const afterRequest = new Date();

    const timestamp = new Date(response.body.timestamp);

    // Timestamp should be between before and after request
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(afterRequest.getTime());
  });

  it('should return response body with correct structure', async () => {
    const response = await request(app).get('/api/health');

    expect(response.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
  });

  it('should handle multiple rapid requests', async () => {
    const promises = Array(5).fill(null).map(() =>
      request(app).get('/api/health')
    );

    const responses = await Promise.all(promises);

    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeTruthy();
    });
  });

  it('should not accept POST method', async () => {
    const response = await request(app)
      .post('/api/health')
      .send({ test: 'data' });

    expect(response.status).toBe(404);
  });

  it('should not accept PUT method', async () => {
    const response = await request(app).put('/api/health');
    expect(response.status).toBe(404);
  });

  it('should not accept DELETE method', async () => {
    const response = await request(app).delete('/api/health');
    expect(response.status).toBe(404);
  });
});
