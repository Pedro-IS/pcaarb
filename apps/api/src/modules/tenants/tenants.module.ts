import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TrialExpiryService } from './trial-expiry.service';

@Module({
  imports: [AuditLogModule],
  controllers: [TenantsController],
  providers: [TenantsService, TrialExpiryService],
  exports: [TenantsService, TrialExpiryService],
})
export class TenantsModule {}
