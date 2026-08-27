import { Event } from 'src/modules/events/entities/event.entity';
import { Subscription } from 'src/modules/subscriptions/entities/subscription.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DeliveryStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILED = 'failed',
  DEAD = 'dead',
}

@Entity()
@Index(['eventId', 'subscriptionId'], { unique: true })
export class DeliveryAttempt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  eventId!: number;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column()
  subscriptionId!: number;

  @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription!: Subscription;

  @Column({ type: 'text' })
  status!: DeliveryStatus;

  @Column({ default: 0 })
  attemptCount!: number;

  @Column({ default: 5 })
  maxAttempts!: number;

  @Column({ type: 'datetime' })
  nextAttemptAt!: Date;

  @Column({ type: 'integer', nullable: true })
  lastHttpStatus!: number | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'integer', nullable: true })
  durationMs!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt!: Date | null;
}
