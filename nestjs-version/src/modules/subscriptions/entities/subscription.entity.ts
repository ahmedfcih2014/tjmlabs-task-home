import { SubscriptionEventType } from 'src/modules/subscriptions/entities/subscription-event-type.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Subscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  destinationUrl!: string;

  @Column()
  destinationSecret!: string;

  @OneToMany(
    () => SubscriptionEventType,
    (eventType) => eventType.subscription,
    {
      cascade: true,
      orphanedRowAction: 'delete',
    },
  )
  eventTypes!: SubscriptionEventType[];

  @CreateDateColumn()
  createdAt!: Date;
}
