import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from 'src/modules/auth/types/auth-user.type';
import { SignIn } from 'src/modules/auth/types/sign-in.type';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * hint: just for verification simple only, it could check user exists in db or cache
   * @param username
   * @param pass
   * @returns SignIn
   */
  async signIn(username: string, pass: string): Promise<SignIn> {
    if (username !== 'admin' || pass !== 'admin') {
      throw new UnauthorizedException();
    }
    // sub should be user id and other required fields for authorized the request or just load user in the gaurd
    const payload: AuthUser = { sub: 1, username };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
