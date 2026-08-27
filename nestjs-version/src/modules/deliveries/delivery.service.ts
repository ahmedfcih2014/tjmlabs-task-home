import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeliveryAttemptResponse } from 'src/modules/deliveries/dto/delivery-attempt-response';
import {
  DeliveryAttempt,
  DeliveryStatus,
} from 'src/modules/deliveries/entities/delivery-attempt.entity';
import { WebhookClient } from 'src/modules/deliveries/webhook-client.service';
import { Event } from 'src/modules/events/entities/event.entity';
import { EncryptionService } from 'src/modules/subscriptions/encryption.service';
import { Subscription } from 'src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionEventType } from 'src/modules/subscriptions/entities/subscription-event-type.entity';
import { LessThanOrEqual, Repository } from 'typeorm';

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @InjectRepository(DeliveryAttempt)
    private readonly deliveryAttemptRepository: Repository<DeliveryAttempt>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionEventType)
    private readonly subscriptionEventTypeRepository: Repository<SubscriptionEventType>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly encryptionService: EncryptionService,
    private readonly webhookClient: WebhookClient,
  ) {}

  async enqueueForEvent(event: Event): Promise<void> {
    const rows = await this.subscriptionEventTypeRepository
      .createQueryBuilder('eventType')
      .innerJoin('eventType.subscription', 'subscription')
      .where('eventType.name = :eventType', { eventType: event.eventType })
      .select('subscription.id', 'subscriptionId')
      .getRawMany<{ subscriptionId: number }>();

    const subscriptionIds = [...new Set(rows.map((row) => row.subscriptionId))];

    if (subscriptionIds.length === 0) {
      return;
    }

    const now = new Date();
    const attempts = subscriptionIds.map((subscriptionId) => ({
      eventId: Number(event.id),
      subscriptionId,
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: now,
      lastHttpStatus: null,
      lastError: null,
      durationMs: null,
      deliveredAt: null,
    }));

    await this.deliveryAttemptRepository
      .createQueryBuilder()
      .insert()
      .into(DeliveryAttempt)
      .values(attempts)
      .orIgnore()
      .execute();
  }

  async claimDueAttempts(limit: number): Promise<DeliveryAttempt[]> {
    this.logger.log(`claimDueAttempts, limit: ${limit}`);
    const now = new Date();
    const dueAttempts = await this.deliveryAttemptRepository.find({
      where: [
        {
          status: DeliveryStatus.PENDING,
          nextAttemptAt: LessThanOrEqual(now),
        },
        {
          status: DeliveryStatus.FAILED,
          nextAttemptAt: LessThanOrEqual(now),
        },
      ],
      take: limit,
      order: { nextAttemptAt: 'ASC' },
    });

    const claimed: DeliveryAttempt[] = [];

    for (const attempt of dueAttempts) {
      if (attempt.attemptCount >= attempt.maxAttempts) {
        continue;
      }

      attempt.status = DeliveryStatus.IN_PROGRESS;
      await this.deliveryAttemptRepository.save(attempt);
      claimed.push(attempt);
    }

    return claimed;
  }

  async processAttempt(attemptId: number): Promise<void> {
    const attempt = await this.deliveryAttemptRepository.findOne({
      where: { id: attemptId },
      relations: { event: true, subscription: true },
    });

    if (!attempt || attempt.status !== DeliveryStatus.IN_PROGRESS) {
      return;
    }

    const event = attempt.event ?? (await this.loadEvent(attempt.eventId));
    const subscription =
      attempt.subscription ??
      (await this.subscriptionRepository.findOne({
        where: { id: attempt.subscriptionId },
      }));

    if (!subscription) {
      await this.markDead(attempt, 'Subscription no longer exists');
      return;
    }

    const secret = this.encryptionService.decrypt(
      subscription.destinationSecret,
    );
    const result = await this.webhookClient.deliver(
      subscription.destinationUrl,
      secret,
      event,
    );

    if (result.success) {
      attempt.status = DeliveryStatus.SUCCESS;
      attempt.lastHttpStatus = result.httpStatus;
      attempt.lastError = null;
      attempt.durationMs = result.durationMs;
      attempt.deliveredAt = new Date();
      await this.deliveryAttemptRepository.save(attempt);
      return;
    }

    attempt.attemptCount += 1;
    attempt.lastHttpStatus = result.httpStatus;
    attempt.lastError = result.error;
    attempt.durationMs = result.durationMs;

    if (attempt.attemptCount >= attempt.maxAttempts) {
      attempt.status = DeliveryStatus.DEAD;
      await this.deliveryAttemptRepository.save(attempt);
      return;
    }

    attempt.status = DeliveryStatus.FAILED;
    attempt.nextAttemptAt = this.computeNextAttemptAt(attempt.attemptCount);
    await this.deliveryAttemptRepository.save(attempt);
  }

  async listBySubscription(
    subscriptionId: number,
    page: number,
    limit: number,
  ): Promise<{ deliveries: DeliveryAttemptResponse[]; total: number }> {
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1) {
      throw new BadRequestException('Limit must be greater than 0');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const [deliveries, total] =
      await this.deliveryAttemptRepository.findAndCount({
        where: { subscriptionId },
        skip: (page - 1) * limit,
        take: limit,
        order: { id: 'DESC' },
      });

    return {
      deliveries: deliveries.map((delivery) =>
        this.toDeliveryResponse(delivery),
      ),
      total,
    };
  }

  private async loadEvent(eventId: number): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id: String(eventId) },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    return event;
  }

  private async markDead(
    attempt: DeliveryAttempt,
    error: string,
  ): Promise<void> {
    attempt.status = DeliveryStatus.DEAD;
    attempt.lastError = error;
    await this.deliveryAttemptRepository.save(attempt);
  }

  private computeNextAttemptAt(attemptCount: number): Date {
    const delayMs = Math.min(Math.pow(2, attemptCount) * 1000, MAX_BACKOFF_MS);

    return new Date(Date.now() + delayMs);
  }

  private toDeliveryResponse(
    delivery: DeliveryAttempt,
  ): DeliveryAttemptResponse {
    return {
      id: delivery.id,
      eventId: delivery.eventId,
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      lastHttpStatus: delivery.lastHttpStatus,
      lastError: delivery.lastError,
      durationMs: delivery.durationMs,
      nextAttemptAt: delivery.nextAttemptAt,
      deliveredAt: delivery.deliveredAt,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    };
  }
}
