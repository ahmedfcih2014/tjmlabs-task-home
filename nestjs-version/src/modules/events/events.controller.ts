import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/modules/auth/guards/auth.guard';
import { CreateEventDto } from 'src/modules/events/dto/create-event.dto';
import { EventsService } from 'src/modules/events/events.service';

@Controller({
  path: 'events',
  version: '1',
})
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  createEvent(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.createEvent(createEventDto);
  }
}
