import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  getAccessToken,
  resetDatabase,
} from './helpers/create-test-app';
import { DeliveryStatus } from '../src/modules/deliveries/entities/delivery-attempt.entity';

describe('Deliveries API (e2e)', () => {
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

  async function createSubscription(eventTypes: string[]) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/subscrptions')
      .set(auth())
      .send({
        destinationUrl: 'https://example.com/webhook',
        destinationSecret: 'receiver-credential',
        eventTypes,
      })
      .expect(201);

    return response.body as { id: number };
  }

  describe('GET /api/v1/subscrptions/:id/deliveries', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/subscrptions/1/deliveries')
        .expect(401);
    });

    it('returns 404 when the subscription does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscrptions/99999/deliveries')
        .set(auth())
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
        message: 'Subscription not found',
      });
    });

    it('returns an empty list when no events have been enqueued', async () => {
      const subscription = await createSubscription(['order.created']);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscrptions/${subscription.id}/deliveries`)
        .set(auth())
        .expect(200);

      expect(response.body).toEqual({
        deliveries: [],
        total: 0,
      });
    });

    it('lists pending delivery attempts after a matching event is ingested', async () => {
      const subscription = await createSubscription(['order.created']);

      const event = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'order.created',
          payload: { order_id: 'ord_123' },
          idempotencyKey: 'evt-delivery-1',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscrptions/${subscription.id}/deliveries`)
        .query({ page: 1, limit: 10 })
        .set(auth())
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.deliveries).toHaveLength(1);
      expect(response.body.deliveries[0]).toMatchObject({
        eventId: Number(event.body.id),
        status: DeliveryStatus.PENDING,
        attemptCount: 0,
        lastHttpStatus: null,
        lastError: null,
        deliveredAt: null,
      });
      expect(response.body.deliveries[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          nextAttemptAt: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      );
    });

    it('does not enqueue deliveries for non-matching event types', async () => {
      const subscription = await createSubscription(['order.created']);

      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send({
          eventType: 'invoice.paid',
          payload: { invoice_id: 'inv_1' },
          idempotencyKey: 'evt-no-match',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscrptions/${subscription.id}/deliveries`)
        .set(auth())
        .expect(200);

      expect(response.body).toEqual({
        deliveries: [],
        total: 0,
      });
    });

    it('does not create duplicate delivery rows on idempotent event replay', async () => {
      const subscription = await createSubscription(['order.created']);
      const payload = {
        eventType: 'order.created',
        payload: { order_id: 'ord_123' },
        idempotencyKey: 'evt-idempotent-delivery',
      };

      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/events')
        .set(auth())
        .send(payload)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscrptions/${subscription.id}/deliveries`)
        .set(auth())
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.deliveries).toHaveLength(1);
    });

    it('rejects invalid pagination', async () => {
      const subscription = await createSubscription(['order.created']);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscrptions/${subscription.id}/deliveries`)
        .query({ page: 1, limit: 0 })
        .set(auth())
        .expect(400);

      expect(response.body.message).toBe('Limit must be greater than 0');
    });
  });
});
