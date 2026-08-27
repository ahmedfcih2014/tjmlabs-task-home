import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, resetDatabase } from './helpers/create-test-app';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/get-token', () => {
    it('returns a JWT for valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/get-token')
        .send({ username: 'admin', password: 'admin' })
        .expect(201);

      expect(response.body).toEqual({
        access_token: expect.any(String),
      });
      expect(response.body.access_token.split('.')).toHaveLength(3);
    });

    it('rejects invalid credentials with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/get-token')
        .send({ username: 'admin', password: 'wrong' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
        message: 'Unauthorized',
        path: '/api/v1/auth/get-token',
      });
      expect(response.body.timestamp).toEqual(expect.any(String));
    });

    it('rejects missing fields with validation error', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/get-token')
        .send({ username: 'admin' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
      });
      expect(response.body.errors).toHaveProperty('password');
    });

    it('rejects unknown fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/get-token')
        .send({
          username: 'admin',
          password: 'admin',
          extra: 'nope',
        })
        .expect(400);
    });
  });
});
