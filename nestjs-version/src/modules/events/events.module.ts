import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from 'src/modules/events/entities/event.entity';
import { AuthModule } from 'src/modules/auth/auth.module';
import { DeliveriesModule } from 'src/modules/deliveries/deliveries.module';

@Module({
  imports: [AuthModule, DeliveriesModule, TypeOrmModule.forFeature([Event])],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
