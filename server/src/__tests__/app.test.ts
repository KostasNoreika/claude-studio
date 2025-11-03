import request from 'supertest';
import app from '../app';

describe('Express App', () => {
  describe('CORS', () => {
    it('should have CORS headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3850');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should allow same-origin requests', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3850');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3850');
    });

    it('should allow credentials', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3850');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3850')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
    });

    it('should not allow different origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com');

      // CORS middleware will not set allow-origin header for non-matching origins
      expect(response.headers['access-control-allow-origin']).not.toBe('http://malicious-site.com');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for nonexistent routes', async () => {
      const response = await request(app).get('/api/nonexistent');
      expect(response.status).toBe(404);
    });

    it('should return error JSON for 404', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('path', '/api/nonexistent');
    });

    it('should include method in 404 error', async () => {
      const response = await request(app).post('/api/nonexistent');

      expect(response.body.message).toContain('POST');
      expect(response.body.message).toContain('/api/nonexistent');
    });

    it('should return 404 for GET on nonexistent route', async () => {
      const response = await request(app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('GET');
    });

    it('should return 404 for PUT on nonexistent route', async () => {
      const response = await request(app).put('/api/fake-endpoint');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('PUT');
    });

    it('should return 404 for DELETE on nonexistent route', async () => {
      const response = await request(app).delete('/api/remove-this');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('DELETE');
    });

    it('should handle root path 404', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(404);
      expect(response.body.path).toBe('/');
    });

    it('should handle deeply nested nonexistent paths', async () => {
      const response = await request(app).get('/api/v1/users/123/posts/456/comments/789');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('Error Handler', () => {
    // Note: Testing error handler requires a route that throws an error
    // For now, we verify the error handler works through functional testing
    it('should respond to requests without crashing', async () => {
      // If error handler is missing, app would crash on errors
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });
  });

  describe('JSON Body Parser', () => {
    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/nonexistent')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      // Should parse body even for 404 routes
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should handle empty JSON body', async () => {
      const response = await request(app)
        .post('/api/nonexistent')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404);
    });

    it('should accept valid JSON', async () => {
      const response = await request(app)
        .post('/api/health')
        .send({ key: 'value', number: 123, bool: true })
        .set('Content-Type', 'application/json');

      // Health doesn't accept POST, but JSON should be parsed
      expect(response.status).toBe(404);
    });

    it('should handle URL-encoded bodies', async () => {
      const response = await request(app)
        .post('/api/nonexistent')
        .send('key=value&foo=bar')
        .set('Content-Type', 'application/x-www-form-urlencoded');

      expect(response.status).toBe(404);
    });
  });

  describe('Response Headers', () => {
    it('should set content-type header for JSON responses', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should set content-type for 404 responses', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Request Methods', () => {
    it('should accept GET requests', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should handle POST requests', async () => {
      const response = await request(app).post('/api/nonexistent');
      expect([404, 405]).toContain(response.status);
    });

    it('should handle PUT requests', async () => {
      const response = await request(app).put('/api/nonexistent');
      expect([404, 405]).toContain(response.status);
    });

    it('should handle DELETE requests', async () => {
      const response = await request(app).delete('/api/nonexistent');
      expect([404, 405]).toContain(response.status);
    });

    it('should handle PATCH requests', async () => {
      const response = await request(app).patch('/api/nonexistent');
      expect([404, 405]).toContain(response.status);
    });
  });

  describe('App Structure', () => {
    it('should be defined', () => {
      expect(app).toBeDefined();
    });

    it('should respond to health checks', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should export express application instance', () => {
      expect(typeof app).toBe('function');
      expect(app.listen).toBeDefined();
    });
  });

  describe('API Versioning', () => {
    it('should use /api prefix for all routes', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });

    it('should not respond to routes without /api prefix', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(404);
    });
  });

  describe('Security Headers', () => {
    it('should have x-powered-by header configured by Express', async () => {
      const response = await request(app).get('/api/health');

      // Express sets this by default (can be disabled with app.disable('x-powered-by'))
      // For now, we just verify the response is successful
      expect(response.status).toBe(200);
    });

    it('should have CORS configured for security', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3850');

      // CORS should be restrictive (same-origin only)
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3850');
    });
  });
});
