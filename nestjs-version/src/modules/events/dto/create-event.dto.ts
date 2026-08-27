import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  eventType!: string;

  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, any>;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  idempotencyKey: string | undefined;
}
