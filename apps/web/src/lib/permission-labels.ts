import type { PermissionAction, PermissionSubject } from '@pcaarb/shared';

export const PERMISSION_SUBJECT_LABELS: Record<PermissionSubject, string> = {
  Sale: 'Sales',
  SaleReturn: 'Returns',
  CashSession: 'Cash register',
  Product: 'Products',
  Category: 'Categories',
  Customer: 'Customers',
  Supplier: 'Suppliers',
  StockMovement: 'Stock movement',
  StockCount: 'Inventory',
  FinanceEntry: 'Finance',
  CostCenter: 'Cost center',
  PurchaseOrder: 'Purchases',
  Report: 'Reports',
  User: 'Users',
  Store: 'Stores',
};

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  manage: 'Manage all',
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
};
