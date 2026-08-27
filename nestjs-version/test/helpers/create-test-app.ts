import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { DeliveryWorker } from '../../src/modules/deliveries/cron/delivery-worker.service';
import { DeliveryService } from '../../src/modules/deliveries/delivery.service';
import { WebhookClient } from '../../src/modules/deliveries/webhook-client.service';

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

export type TestAppContext = {
  app: INestApplication;
  dataSource: DataSource;
  module: TestingModule;
};

export type CreateTestAppOptions = {
  /** When true (default), cron is a no-op so API tests stay deterministic. */
  stubDeliveryWorker?: boolean;
  /** Optional webhook override for delivery-worker tests. */
  webhookClient?: Pick<WebhookClient, 'deliver'>;
};

/**
 * Boots the Nest app the same way as production (prefix, versioning, pipes)
 * with an isolated in-memory SQLite DB.
 */
export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<TestAppContext> {
  const { stubDeliveryWorker = true, webhookClient } = options;

  process.env.JWT_SECRET ??= 'e2e-test-jwt-secret';
  process.env.JWT_EXPIRES_IN ??= '1d';
  process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
  process.env.DB_TYPE = 'better-sqlite3';
  process.env.DB_DATABASE = ':memory:';

  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (stubDeliveryWorker) {
    // Plain useValue → ScheduleModule does not register a ticking cron.
    builder = builder.overrideProvider(DeliveryWorker).useValue({
      processDueDeliveries: async () => undefined,
    });
  } else {
    // Keep real worker logic, but expose it without @Cron so tests stay deterministic.
    builder = builder.overrideProvider(DeliveryWorker).useFactory({
      inject: [DeliveryService],
      factory: (deliveryService: DeliveryService) => {
        const worker = new DeliveryWorker(deliveryService);
        return {
          processDueDeliveries: () => worker.processDueDeliveries(),
        };
      },
    });
  }

  if (webhookClient) {
    builder = builder.overrideProvider(WebhookClient).useValue(webhookClient);
  }

  const module = await builder.compile();
  const app = module.createNestApplication();

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        return new BadRequestException({
          message: 'Validation failed',
          errors: errors.map((error) => ({
            field: error.property,
            constraints: error.constraints,
          })),
        });
      },
    }),
  );

  await app.init();

  const dataSource = app.get<DataSource>(getDataSourceToken());

  return { app, dataSource, module };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.synchronize(true);
}

export async function getAccessToken(
  app: INestApplication,
  username = 'admin',
  password = 'admin',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/get-token')
    .send({ username, password })
    .expect(201);

  return response.body.access_token as string;
}
