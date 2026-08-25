import { BadRequestException, Body, Controller, Delete, Get, Patch, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  updateTenantBrandingSchema,
  TENANT_LOGO_ALLOWED_MIME_TYPES,
  TENANT_LOGO_MAX_BYTES,
  type JwtPayload,
  type UpdateTenantBrandingInput,
} from '@pcaarb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TenantsService } from './tenants.service';

// Branding is a business-owner decision, not operational management —
// @Roles('owner') on the mutations, same reasoning BillingController
// documents for subscribe/cancel. The GET has no @Roles at all: every role
// needs the logo to render the PDV/topbar header, same as GET /users/me.
@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('branding/logo')
  async getLogo(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const logo = await this.tenantsService.getLogo(user.tenantId);
    if (!logo) {
      res.status(404).end();
      return;
    }
    res.set({ 'Content-Type': logo.mimeType, 'Cache-Control': 'private, max-age=300' });
    res.send(logo.data);
  }

  @Roles('owner')
  @Patch('branding')
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: TENANT_LOGO_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!(TENANT_LOGO_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
          cb(new BadRequestException('O logo precisa ser PNG, JPEG ou WebP'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async updateBranding(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateTenantBrandingSchema)) body: UpdateTenantBrandingInput,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    const tenant = await this.tenantsService.updateBranding(user.tenantId, {
      displayName: body.displayName,
      ...(logo ? { logoBuffer: logo.buffer, logoMimeType: logo.mimetype } : {}),
    });
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'tenant.branding_updated',
      targetType: 'Tenant',
      targetId: user.tenantId,
      metadata: { displayNameChanged: true, logoChanged: !!logo },
    });
    return this.tenantsService.toSafeTenant(tenant);
  }

  @Roles('owner')
  @Delete('branding/logo')
  async removeLogo(@CurrentUser() user: JwtPayload) {
    const tenant = await this.tenantsService.removeLogo(user.tenantId);
    await this.auditLogService.record({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      action: 'tenant.branding_updated',
      targetType: 'Tenant',
      targetId: user.tenantId,
      metadata: { logoRemoved: true },
    });
    return this.tenantsService.toSafeTenant(tenant);
  }
}
