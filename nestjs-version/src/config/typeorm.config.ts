import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  // this type casting to make sure lint will works fine and the supported type should be one of the 3 mentioned types
  type: configService.get<string>('DB_TYPE', 'better-sqlite3') as
    'better-sqlite3' | 'mysql' | 'postgres',
  database: configService.get<string>('DB_DATABASE', 'database.sqlite'),
  autoLoadEntities: true,
  synchronize: true,
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
});
