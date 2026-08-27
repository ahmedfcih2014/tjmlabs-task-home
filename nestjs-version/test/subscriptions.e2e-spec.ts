import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  getAccessToken,
  resetDatabase,
} from './helpers/create-test-app';

const subscriptionPayload = {
  destinationUrl: 'https://example.com/webhook',
  destinationSecret: 'receiver-credential',
  eventTypes: ['order.created', 'order.updated'],
};

describe('Subscriptions API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    token = await getAccessToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  describe('auth guard', () => {
    it('rejects requests without a bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/subscrptions')
        .expect(401);
    });

    it('rejects requests with an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/subscrptions')
        .set({ Authorization: 'Bearer not-a-jwt' })
        .expect(401);
    });
  });

  describe('POST /api/v1/subscrptions', () => {
    it('creates a subscription and never returns the secret', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(Number),
        destinationUrl: subscriptionPayload.destinationUrl,
        eventTypes: expect.arrayContaining(subscriptionPayload.eventTypes),
        createdAt: expect.any(String),
      });
      expect(response.body).not.toHaveProperty('destinationSecret');
      expect(JSON.stringify(response.body)).not.toContain(
        subscriptionPayload.destinationSecret,
      );
    });

    it('returns 409 when destination URL already exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 409,
        message: 'Subscription with this destination URL already exists',
      });
    });

    it('rejects invalid payloads', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send({
          destinationUrl: 'not-a-url',
          destinationSecret: '',
          eventTypes: [],
        })
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(
        expect.objectContaining({
          destinationUrl: expect.any(String),
          destinationSecret: expect.any(String),
          eventTypes: expect.any(String),
        }),
      );
    });
  });

  describe('PUT /api/v1/subscrptions', () => {
    it('creates when destination URL is new', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(200);

      expect(response.body.id).toEqual(expect.any(Number));
      expect(response.body.destinationUrl).toBe(
        subscriptionPayload.destinationUrl,
      );
      expect(response.body).not.toHaveProperty('destinationSecret');
    });

    it('updates event types and secret for an existing destination URL', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(201);

      const updated = await request(app.getHttpServer())
        .put('/api/v1/subscrptions')
        .set(auth())
        .send({
          destinationUrl: subscriptionPayload.destinationUrl,
          destinationSecret: 'rotated-secret',
          eventTypes: ['invoice.paid'],
        })
        .expect(200);

      expect(updated.body.id).toBe(created.body.id);
      expect(updated.body.eventTypes).toEqual(['invoice.paid']);
      expect(updated.body).not.toHaveProperty('destinationSecret');
      expect(JSON.stringify(updated.body)).not.toContain('rotated-secret');
    });
  });

  describe('GET /api/v1/subscrptions', () => {
    it('lists subscriptions with pagination metadata', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send({
          ...subscriptionPayload,
          destinationUrl: 'https://hooks.example.org/other',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/v1/subscrptions')
        .query({ page: 1, limit: 1 })
        .set(auth())
        .expect(200);

      expect(response.body.total).toBe(2);
      expect(response.body.subscriptions).toHaveLength(1);
      expect(response.body.subscriptions[0]).not.toHaveProperty(
        'destinationSecret',
      );
    });

    it('rejects invalid pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscrptions')
        .query({ page: 0, limit: 10 })
        .set(auth())
        .expect(400);

      expect(response.body.message).toBe('Page must be greater than 0');
    });
  });

  describe('GET /api/v1/subscrptions/:id', () => {
    it('returns a single subscription without the secret', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/subscrptions')
        .set(auth())
        .send(subscriptionPayload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscrptions/${created.body.id}`)
        .set(auth())
        .expect(200);

      expect(response.body).toEqual({
        id: created.body.id,
        destinationUrl: subscriptionPayload.destinationUrl,
        eventTypes: expect.arrayContaining(subscriptionPayload.eventTypes),
        createdAt: expect.any(String),
      });
      expect(response.body).not.toHaveProperty('destinationSecret');
    });

    it('returns 404 for unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscrptions/99999')
        .set(auth())
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
        message: 'Subscription not found',
      });
    });

    it('rejects non-numeric ids', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/subscrptions/abc')
        .set(auth())
        .expect(400);
    });
  });
});
