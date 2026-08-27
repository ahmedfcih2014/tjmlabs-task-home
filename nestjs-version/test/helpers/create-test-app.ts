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

const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

export type TestAppContext = {
  app: INestApplication;
  dataSource: DataSource;
};

/**
 * Boots the Nest app the same way as production (prefix, versioning, pipes)
 * with an isolated in-memory SQLite DB and the delivery cron stubbed out.
 */
export async function createTestApp(): Promise<TestAppContext> {
  process.env.JWT_SECRET ??= 'e2e-test-jwt-secret';
  process.env.JWT_EXPIRES_IN ??= '1d';
  process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
  process.env.DB_TYPE = 'better-sqlite3';
  process.env.DB_DATABASE = ':memory:';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DeliveryWorker)
    .useValue({
      processDueDeliveries: async () => undefined,
    })
    .compile();

  const app = moduleFixture.createNestApplication();

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

  return { app, dataSource };
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
