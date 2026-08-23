import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookRetryService } from './webhook-retry.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookRetryService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
