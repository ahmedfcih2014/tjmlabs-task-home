import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DeliveryService } from 'src/modules/deliveries/delivery.service';
import { CreateEventDto } from 'src/modules/events/dto/create-event.dto';
import { Event } from 'src/modules/events/entities/event.entity';
import { Repository } from 'typeorm';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly deliveryService: DeliveryService,
  ) {}

  async createEvent(createEventDto: CreateEventDto) {
    const payloadHash = this.hashPayload(createEventDto.payload);
    const idempotencyKey = createEventDto.idempotencyKey ?? randomUUID();

    const existingEvent = await this.eventRepository.findOne({
      where: {
        idempotencyKey,
      },
    });
    if (existingEvent) {
      if (
        existingEvent.payloadHash !== payloadHash ||
        existingEvent.eventType !== createEventDto.eventType
      ) {
        throw new ConflictException(
          'Event already exists with different payload or event type',
        );
      }
      return {
        id: existingEvent.id,
        eventType: existingEvent.eventType,
        idempotencyKey: existingEvent.idempotencyKey,
      };
    }

    const event = this.eventRepository.create({
      ...createEventDto,
      idempotencyKey,
      payloadHash,
    });
    await this.eventRepository.save(event);
    await this.deliveryService.enqueueForEvent(event);
    return {
      id: event.id,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
    };
  }

  private hashPayload(payload: Record<string, any>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
