import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryService } from 'src/modules/deliveries/delivery.service';
import { DeliveryWorker } from 'src/modules/deliveries/cron/delivery-worker.service';
import { DeliveryAttempt } from 'src/modules/deliveries/entities/delivery-attempt.entity';
import { WebhookClient } from 'src/modules/deliveries/webhook-client.service';
import { Event } from 'src/modules/events/entities/event.entity';
import { SubscripionsModule } from 'src/modules/subscriptions/subscripions.module';
import { Subscription } from 'src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionEventType } from 'src/modules/subscriptions/entities/subscription-event-type.entity';

@Module({
  imports: [
    forwardRef(() => SubscripionsModule),
    TypeOrmModule.forFeature([
      DeliveryAttempt,
      Event,
      Subscription,
      SubscriptionEventType,
    ]),
  ],
  providers: [DeliveryService, WebhookClient, DeliveryWorker],
  exports: [DeliveryService],
})
export class DeliveriesModule {}
