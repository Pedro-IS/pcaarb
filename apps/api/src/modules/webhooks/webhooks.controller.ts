import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  type CreateWebhookEndpointInput,
  type JwtPayload,
  type UpdateWebhookEndpointInput,
} from '@pcaarb/shared';
import { CheckAbilities } from '../../common/decorators/check-abilities.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WebhooksService } from './webhooks.service';

// Same 'Integration' subject as api-keys/marketplace — a webhook endpoint is
// another way of configuring an external integration, not a separate
// permission concept. See the comment on 'Integration' in
// ability.factory.ts for why it stays admin/owner-only and out of
// permissionSubjectSchema (an override here would be an escalation path,
// same class of finding that excluded it for api-keys).
@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @CheckAbilities({ action: 'read', subject: 'Integration' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.webhooksService.listEndpoints(user.tenantId);
  }

  @CheckAbilities({ action: 'create', subject: 'Integration' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body(new ZodValidationPipe(createWebhookEndpointSchema)) body: CreateWebhookEndpointInput) {
    return this.webhooksService.createEndpoint(user.tenantId, user.sub, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWebhookEndpointSchema)) body: UpdateWebhookEndpointInput,
  ) {
    return this.webhooksService.updateEndpoint(user.tenantId, id, body);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Post(':id/rotate-secret')
  rotateSecret(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooksService.rotateSecret(user.tenantId, id);
  }

  @CheckAbilities({ action: 'delete', subject: 'Integration' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.webhooksService.deleteEndpoint(user.tenantId, id);
  }

  @CheckAbilities({ action: 'read', subject: 'Integration' })
  @Get(':id/deliveries')
  listDeliveries(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooksService.listDeliveries(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Post(':id/test')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendTest(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.webhooksService.sendTestEvent(user.tenantId, id);
  }

  @CheckAbilities({ action: 'update', subject: 'Integration' })
  @Post('deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  async retryDelivery(@CurrentUser() user: JwtPayload, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    await this.webhooksService.retryDelivery(user.tenantId, deliveryId);
  }
}
