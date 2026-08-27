import { DeliveryStatus } from 'src/modules/deliveries/entities/delivery-attempt.entity';

export class DeliveryAttemptResponse {
  id!: number;
  eventId!: number;
  status!: DeliveryStatus;
  attemptCount!: number;
  lastHttpStatus!: number | null;
  lastError!: string | null;
  durationMs!: number | null;
  nextAttemptAt!: Date;
  deliveredAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
