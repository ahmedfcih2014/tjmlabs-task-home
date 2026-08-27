import { forwardRef, Module } from '@nestjs/common';
import { SubscrptionsController } from './subscrptions.controller';
import { AuthModule } from 'src/modules/auth/auth.module';
import { AuthGuard } from 'src/modules/auth/guards/auth.guard';
import { SubscriptionService } from './subscription.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from 'src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionEventType } from 'src/modules/subscriptions/entities/subscription-event-type.entity';
import { EncryptionService } from './encryption.service';
import { DeliveriesModule } from 'src/modules/deliveries/deliveries.module';

@Module({
  controllers: [SubscrptionsController],
  providers: [AuthGuard, SubscriptionService, EncryptionService],
  imports: [
    AuthModule,
    forwardRef(() => DeliveriesModule),
    TypeOrmModule.forFeature([Subscription, SubscriptionEventType]),
  ],
  exports: [EncryptionService],
})
export class SubscripionsModule {}
