import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateSubscriptionDto } from 'src/modules/subscriptions/dto/create-subscription.dto';
import { SubscriptionEventType } from 'src/modules/subscriptions/entities/subscription-event-type.entity';
import { Subscription } from 'src/modules/subscriptions/entities/subscription.entity';
import { Repository } from 'typeorm';
import { EncryptionService } from 'src/modules/subscriptions/encryption.service';
import { SubscriptionResponse } from 'src/modules/subscriptions/dto/subscription-response';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionEventType)
    private readonly subscriptionEventTypeRepository: Repository<SubscriptionEventType>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async listSubscriptions(
    page: number,
    limit: number,
  ): Promise<{ subscriptions: SubscriptionResponse[]; total: number }> {
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1) {
      throw new BadRequestException('Limit must be greater than 0');
    }

    const [subscriptions, total] =
      await this.subscriptionRepository.findAndCount({
        skip: (page - 1) * limit,
        take: limit,
        order: {
          id: 'DESC',
        },
        relations: {
          eventTypes: true,
        },
      });

    return {
      subscriptions: subscriptions.map((s) => this.toSubscriptionResponse(s)),
      total,
    };
  }

  async getSubscription(id: number): Promise<SubscriptionResponse> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
      relations: {
        eventTypes: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.toSubscriptionResponse(subscription);
  }

  async createSubscription(
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: {
        destinationUrl: createSubscriptionDto.destinationUrl,
      },
      relations: {
        eventTypes: true,
      },
    });

    if (existingSubscription) {
      throw new ConflictException(
        'Subscription with this destination URL already exists',
      );
    }

    const subscription = this.subscriptionRepository.create({
      destinationUrl: createSubscriptionDto.destinationUrl,
      destinationSecret: this.encryptionService.encrypt(
        createSubscriptionDto.destinationSecret,
      ),
    });
    const savedSubscription =
      await this.subscriptionRepository.save(subscription);

    const eventTypes = createSubscriptionDto.eventTypes.map((eventType) =>
      this.subscriptionEventTypeRepository.create({
        name: eventType,
        subscription: savedSubscription,
      }),
    );
    await this.subscriptionEventTypeRepository.save(eventTypes);

    return this.toSubscriptionResponse(savedSubscription);
  }

  async updateOrCreateSubscription(
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: {
        destinationUrl: createSubscriptionDto.destinationUrl,
      },
    });
    if (existingSubscription) {
      return await this.updateSubscription(
        existingSubscription,
        createSubscriptionDto,
      );
    } else {
      return await this.createSubscription(createSubscriptionDto);
    }
  }

  private async updateSubscription(
    subscription: Subscription,
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    subscription.destinationUrl = createSubscriptionDto.destinationUrl;

    subscription.destinationSecret = this.encryptionService.encrypt(
      createSubscriptionDto.destinationSecret,
    );

    subscription.eventTypes = createSubscriptionDto.eventTypes.map(
      (eventType) =>
        this.subscriptionEventTypeRepository.create({
          name: eventType,
          subscription,
        }),
    );

    await this.subscriptionRepository.save(subscription);

    return this.toSubscriptionResponse(subscription);
  }

  private toSubscriptionResponse(
    subscription: Subscription,
  ): SubscriptionResponse {
    return {
      id: subscription.id,
      destinationUrl: subscription.destinationUrl,
      eventTypes: subscription.eventTypes.map((eventType) => eventType.name),
      createdAt: subscription.createdAt,
    };
  }
}
