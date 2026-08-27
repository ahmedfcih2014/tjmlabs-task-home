import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { createTestApp, getAccessToken, resetDatabase } from './helpers/create-test-app';
import { DeliveryWorker } from '../src/modules/deliveries/cron/delivery-worker.service';
import {
  DeliveryAttempt,
  DeliveryStatus,
} from '../src/modules/deliveries/entities/delivery-attempt.entity';
import {
  WebhookClient,
  WebhookDeliveryResult,
} from '../src/modules/deliveries/webhook-client.service';

describe('DeliveryWorker cron (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let worker: DeliveryWorker;
  let attemptRepo: Repository<DeliveryAttempt>;
  let token: string;
  let deliverMock: jest.Mock<
    Promise<WebhookDeliveryResult>,
    Parameters<WebhookClient['deliver']>
  >;

  beforeAll(async () => {
    deliverMock = jest.fn();

    ({ app, dataSource } = await createTestApp({
      stubDeliveryWorker: false,
      webhookClient: { deliver: (...args) => deliverMock(...args) },
    }));

    worker = app.get(DeliveryWorker);
    attemptRepo = dataSource.getRepository(DeliveryAttempt);
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    token = await getAccessToken(app);
    deliverMock.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function seedPendingDelivery(options?: {
    destinationUrl?: string;
    secret?: string;
    eventType?: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const destinationUrl =
      options?.destinationUrl ?? 'https://example.com/webhook';
    const secret = options?.secret ?? 'receiver-credential';
    const eventType = options?.eventType ?? 'order.created';

    const subscription = await request(app.getHttpServer())
      .post('/api/v1/subscrptions')
      .set(auth())
      .send({
        destinationUrl,
        destinationSecret: secret,
        eventTypes: [eventType],
      })
      .expect(201);

    const event = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set(auth())
      .send({
        eventType,
        payload: options?.payload ?? { order_id: 'ord_123' },
        idempotencyKey: options?.idempotencyKey ?? `evt-${Date.now()}`,
      })
      .expect(201);

    const attempts = await attemptRepo.find({
      where: { subscriptionId: subscription.body.id },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe(DeliveryStatus.PENDING);

    return {
      subscriptionId: subscription.body.id as number,
      eventId: event.body.id as string | number,
      attempt: attempts[0],
      secret,
      destinationUrl,
      eventType,
      payload: options?.payload ?? { order_id: 'ord_123' },
    };
  }

  it('delivers due attempts and marks them success', async () => {
    const seeded = await seedPendingDelivery({
      idempotencyKey: 'cron-success',
    });

    deliverMock.mockResolvedValue({
      success: true,
      httpStatus: 200,
      durationMs: 12,
    });

    await worker.processDueDeliveries();

    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(deliverMock).toHaveBeenCalledWith(
      seeded.destinationUrl,
      seeded.secret,
      expect.objectContaining({
        id: expect.anything(),
        eventType: seeded.eventType,
        payload: seeded.payload,
      }),
    );

    const attempt = await attemptRepo.findOneByOrFail({ id: seeded.attempt.id });
    expect(attempt.status).toBe(DeliveryStatus.SUCCESS);
    expect(attempt.lastHttpStatus).toBe(200);
    expect(attempt.lastError).toBeNull();
    expect(attempt.durationMs).toBe(12);
    expect(attempt.deliveredAt).toBeInstanceOf(Date);
    expect(attempt.attemptCount).toBe(0);
  });

  it('marks failed attempts and schedules exponential backoff retry', async () => {
    const seeded = await seedPendingDelivery({
      idempotencyKey: 'cron-retry',
    });
    const before = Date.now();

    deliverMock.mockResolvedValue({
      success: false,
      httpStatus: 503,
      durationMs: 8,
      error: 'Destination responded with HTTP 503',
    });

    await worker.processDueDeliveries();

    const attempt = await attemptRepo.findOneByOrFail({ id: seeded.attempt.id });
    expect(attempt.status).toBe(DeliveryStatus.FAILED);
    expect(attempt.attemptCount).toBe(1);
    expect(attempt.lastHttpStatus).toBe(503);
    expect(attempt.lastError).toBe('Destination responded with HTTP 503');
    expect(attempt.deliveredAt).toBeNull();
    // backoff = 2^1 seconds = 2s
    expect(attempt.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 2000);
  });

  it('does not reclaim attempts whose nextAttemptAt is still in the future', async () => {
    const seeded = await seedPendingDelivery({
      idempotencyKey: 'cron-not-due',
    });

    deliverMock.mockResolvedValue({
      success: false,
      httpStatus: 500,
      durationMs: 1,
      error: 'Destination responded with HTTP 500',
    });

    await worker.processDueDeliveries();
    expect(deliverMock).toHaveBeenCalledTimes(1);

    deliverMock.mockClear();
    await worker.processDueDeliveries();

    expect(deliverMock).not.toHaveBeenCalled();
    const attempt = await attemptRepo.findOneByOrFail({ id: seeded.attempt.id });
    expect(attempt.status).toBe(DeliveryStatus.FAILED);
    expect(attempt.attemptCount).toBe(1);
  });

  it('retries a failed attempt once nextAttemptAt is due', async () => {
    const seeded = await seedPendingDelivery({
      idempotencyKey: 'cron-retry-due',
    });

    deliverMock.mockResolvedValueOnce({
      success: false,
      httpStatus: 502,
      durationMs: 1,
      error: 'Destination responded with HTTP 502',
    });

    await worker.processDueDeliveries();

    await attemptRepo.update(seeded.attempt.id, {
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    deliverMock.mockResolvedValueOnce({
      success: true,
      httpStatus: 200,
      durationMs: 5,
    });

    await worker.processDueDeliveries();

    const attempt = await attemptRepo.findOneByOrFail({ id: seeded.attempt.id });
    expect(deliverMock).toHaveBeenCalledTimes(2);
    expect(attempt.status).toBe(DeliveryStatus.SUCCESS);
    expect(attempt.attemptCount).toBe(1);
    expect(attempt.deliveredAt).toBeInstanceOf(Date);
  });

  it('marks an attempt dead after maxAttempts are exhausted', async () => {
    const seeded = await seedPendingDelivery({
      idempotencyKey: 'cron-dead',
    });

    await attemptRepo.update(seeded.attempt.id, {
      attemptCount: 4,
      maxAttempts: 5,
      status: DeliveryStatus.PENDING,
      nextAttemptAt: new Date(),
    });

    deliverMock.mockResolvedValue({
      success: false,
      httpStatus: 500,
      durationMs: 3,
      error: 'Destination responded with HTTP 500',
    });

    await worker.processDueDeliveries();

    const attempt = await attemptRepo.findOneByOrFail({ id: seeded.attempt.id });
    expect(attempt.status).toBe(DeliveryStatus.DEAD);
    expect(attempt.attemptCount).toBe(5);
    expect(attempt.lastHttpStatus).toBe(500);
    expect(attempt.deliveredAt).toBeNull();
  });

  it('skips overlapping cron ticks while a run is in progress', async () => {
    await seedPendingDelivery({ idempotencyKey: 'cron-overlap' });

    let release!: (result: WebhookDeliveryResult) => void;
    deliverMock.mockImplementation(
      () =>
        new Promise<WebhookDeliveryResult>((resolve) => {
          release = resolve;
        }),
    );

    const firstRun = worker.processDueDeliveries();

    await Promise.race([
      new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (deliverMock.mock.calls.length > 0) {
            clearInterval(timer);
            resolve();
          }
        }, 5);
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('deliver was never called')), 2000),
      ),
    ]);

    await worker.processDueDeliveries();
    expect(deliverMock).toHaveBeenCalledTimes(1);

    release({ success: true, httpStatus: 200, durationMs: 1 });
    await firstRun;

    expect(deliverMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there are no due attempts', async () => {
    await worker.processDueDeliveries();
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('exposes delivery outcome through the deliveries API', async () => {
    const seeded = await seedPendingDelivery({
      idempotencyKey: 'cron-api-visibility',
    });

    deliverMock.mockResolvedValue({
      success: true,
      httpStatus: 201,
      durationMs: 9,
    });

    await worker.processDueDeliveries();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/subscrptions/${seeded.subscriptionId}/deliveries`)
      .set(auth())
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.deliveries[0]).toMatchObject({
      status: DeliveryStatus.SUCCESS,
      lastHttpStatus: 201,
      attemptCount: 0,
      deliveredAt: expect.any(String),
    });
  });
});
