import { IsNotEmpty, IsString, Length } from 'class-validator';

export class GetTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  username: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  password: string;
}
