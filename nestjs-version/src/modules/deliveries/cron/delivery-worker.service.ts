import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryService } from 'src/modules/deliveries/delivery.service';

@Injectable()
export class DeliveryWorker {
  private readonly batchSize = 5;
  private isProcessing = false;
  private readonly logger = new Logger(DeliveryWorker.name);

  constructor(private readonly deliveryService: DeliveryService) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processDueDeliveries(): Promise<void> {
    this.logger.log('processDueDeliveries');
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const attempts = await this.deliveryService.claimDueAttempts(
        this.batchSize,
      );

      await Promise.all(
        attempts.map((attempt) =>
          this.deliveryService.processAttempt(attempt.id),
        ),
      );

      this.logger.log(
        `processDueDeliveries finished, claimed ${attempts.length} attempts`,
      );
    } catch (error) {
      this.logger.error('processDueDeliveries failed', error);
    } finally {
      this.isProcessing = false;
      this.logger.log('processDueDeliveries completed');
    }
  }
}
