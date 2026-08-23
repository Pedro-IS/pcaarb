import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhookRetryService {
  private readonly logger = new Logger(WebhookRetryService.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    const retried = await this.webhooksService.retryDueDeliveries();
    if (retried > 0) {
      this.logger.log(`Retried ${retried} webhook deliveries.`);
    }
  }
}
