import {
  AfterInsert,
  AfterLoad,
  AfterUpdate,
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  eventType!: string;

  @Column()
  @Index({ unique: true })
  idempotencyKey!: string;

  // SQLite has no native JSON object type — persist as text, expose as object
  @Column({ type: 'text' })
  payload!: Record<string, unknown>;

  @Column({ type: 'text', name: 'payload_hash' })
  payloadHash!: string;

  @BeforeInsert()
  @BeforeUpdate()
  stringifyPayload(): void {
    if (typeof this.payload !== 'string') {
      (this as { payload: string | Record<string, unknown> }).payload =
        JSON.stringify(this.payload ?? {});
    }
  }

  @AfterLoad()
  @AfterInsert()
  @AfterUpdate()
  parsePayload(): void {
    if (typeof this.payload === 'string') {
      this.payload = JSON.parse(this.payload) as Record<string, unknown>;
    }
  }
}
