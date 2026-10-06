const express = require('express');
const request = require('supertest');
const router = require('../../../src/routes/content-admin.routes');

describe('content admin authorization', () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/content', router);

  test.each(['/analytics', '/leads', '/blog/posts'])('bloqueia %s sem token no servidor', async (path) => {
    const response = await request(app).get(`/admin/content${path}`);
    expect(response.status).toBe(401);
  });
});
