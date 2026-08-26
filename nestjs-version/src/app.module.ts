import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from 'src/shared/filters/global-exception.filter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SubscripionsModule } from './modules/subscriptions/subscripions.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from 'src/config/typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        databaseConfig(configService),
      inject: [ConfigService],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    SubscripionsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
