import type { PurchaseOrder, Supplier } from '@pcaarb/shared';
import { formatCentsToBRL } from '@/lib/currency';

interface PurchaseOrderPrintProps {
  order: PurchaseOrder;
  companyName: string;
  displayName?: string | null;
  logoUrl?: string | null;
  supplier: Supplier | undefined;
}

// This element only exists to be printed/exported as a PDF (see .print-target
// in globals.css) — never shows up on the normal Compras screen. Commercial-
// document layout (full width, not the narrow PDV receipt): it's what the
// store owner sends to the supplier, it needs to look like a real purchase order.
export function PurchaseOrderPrint({ order, companyName, displayName, logoUrl, supplier }: PurchaseOrderPrintProps) {
  const createdAt = new Date(order.createdAt);

  return (
    <div className="print-target w-[700px] p-8 text-sm text-black">
      <div className="flex items-start justify-between border-b border-black pb-4">
        <div className="flex items-center gap-3">
          {/* next/image can't optimize a blob: URL, see LogoMark. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="h-12 w-12 object-contain" />}
          <div>
            <p className="text-lg font-bold">{displayName || companyName}</p>
            <p className="text-muted">Purchase order</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">No. {order.id.slice(0, 8)}</p>
          <p>{createdAt.toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="font-semibold">Supplier</p>
        <p>{supplier?.name ?? '—'}</p>
        {supplier?.document && <p>CPF/CNPJ: {supplier.document}</p>}
        {supplier?.email && <p>{supplier.email}</p>}
        {supplier?.phone && <p>{supplier.phone}</p>}
      </div>

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1.5">Product</th>
            <th className="py-1.5 text-right">Qty.</th>
            <th className="py-1.5 text-right">Unit cost</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-zinc-300">
              <td className="py-1.5">{item.productName}</td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">{formatCentsToBRL(item.unitCostCents)}</td>
              <td className="py-1.5 text-right">{formatCentsToBRL(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex justify-end">
        <p className="font-bold">Total: {formatCentsToBRL(order.totalCents)}</p>
      </div>

      {order.notes && (
        <div className="mt-4 border-t border-black pt-2">
          <p className="font-semibold">Notes</p>
          <p>{order.notes}</p>
        </div>
      )}
    </div>
  );
}
