import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  getAccessToken,
  resetDatabase,
} from './helpers/create-test-app';

describe('Events API (e2e)', () => {
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

  describe('POST /api/v1/events', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_1' },
        })
        .expect(401);
    });

    it('ingests an event and returns id, type, and idempotency key', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_123', total: 42.5 },
          idempotencyKey: 'evt-001',
        })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.anything(),
        eventType: 'order.created',
        idempotencyKey: 'evt-001',
      });
    });

    it('generates an idempotency key when omitted', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_456' },
        })
        .expect(201);

      expect(response.body.idempotencyKey).toEqual(expect.any(String));
      expect(response.body.idempotencyKey.length).toBeGreaterThan(0);
    });

    it('returns the existing event for the same key + payload + type', async () => {
      const payload = {
        eventType: 'order.created',
        payload: { order_id: 'ord_123' },
        idempotencyKey: 'evt-replay',
      };

      const first = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send(payload)
        .expect(201);

      expect(second.body).toEqual(first.body);
    });

    it('returns 409 when the same key is reused with a different payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_123' },
          idempotencyKey: 'evt-conflict',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_999' },
          idempotencyKey: 'evt-conflict',
        })
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 409,
        message: 'Event already exists with different payload or event type',
      });
    });

    it('returns 409 when the same key is reused with a different event type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_123' },
          idempotencyKey: 'evt-type-conflict',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.updated',
          payload: { order_id: 'ord_123' },
          idempotencyKey: 'evt-type-conflict',
        })
        .expect(409);
    });

    it('rejects invalid payloads', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: '',
          payload: 'not-an-object',
        })
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
    });
  });
});
