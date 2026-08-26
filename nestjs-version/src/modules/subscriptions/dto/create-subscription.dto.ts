import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUrl,
  Length,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  @Length(1, 255)
  destinationUrl!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  destinationSecret!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  eventTypes!: string[];
}
