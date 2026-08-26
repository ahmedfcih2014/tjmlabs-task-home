import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from 'src/modules/auth/auth.service';
import { GetTokenDto } from 'src/modules/auth/dto/get-token.dto';

@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('get-token')
  getToken(@Body() getTokenDto: GetTokenDto) {
    return this.authService.signIn(getTokenDto.username, getTokenDto.password);
  }
}
