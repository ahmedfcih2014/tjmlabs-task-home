import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from 'src/modules/auth/guards/auth.guard';
import { CreateSubscriptionDto } from 'src/modules/subscriptions/dto/create-subscription.dto';
import { SubscriptionService } from 'src/modules/subscriptions/subscription.service';

@Controller({
  path: 'subscrptions',
  version: '1',
})
@UseGuards(AuthGuard)
export class SubscrptionsController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  listSubscriptions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10,
  ) {
    return this.subscriptionService.listSubscriptions(page, limit);
  }

  @Post()
  @HttpCode(201)
  async createSubscription(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ) {
    return await this.subscriptionService.createSubscription(
      createSubscriptionDto,
    );
  }

  @Put()
  @HttpCode(200)
  async updateOrCreateSubscription(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ) {
    return await this.subscriptionService.updateOrCreateSubscription(
      createSubscriptionDto,
    );
  }

  @Get(':id')
  async getSubscription(@Param('id', ParseIntPipe) id: number) {
    return await this.subscriptionService.getSubscription(id);
  }
}
