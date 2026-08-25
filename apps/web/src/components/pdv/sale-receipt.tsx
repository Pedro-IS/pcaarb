import type { Sale, PaymentMethod } from '@pcaarb/shared';
import { formatCentsToBRL } from '@/lib/currency';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Cash',
  cartao_credito: 'Credit card',
  cartao_debito: 'Debit card',
  pix: 'Pix',
};

interface SaleReceiptProps {
  sale: Sale;
  companyName: string;
  displayName?: string | null;
  logoUrl?: string | null;
  storeName?: string;
}

// This element only exists to be printed (see .print-target in globals.css)
// — never shows up on the normal PDV screen. Narrow layout (thermal receipt
// printer width), monospace font, deliberately no design-system components
// (Card/Badge): it's a document to hand to the customer, not a panel screen.
// companyName is what fiscal text (NFC-e) below always uses — displayName
// (nome fantasia) is presentation-only, shown here because a receipt is
// customer-facing, not a legal document itself.
export function SaleReceipt({ sale, companyName, displayName, logoUrl, storeName }: SaleReceiptProps) {
  const createdAt = new Date(sale.createdAt);

  return (
    <div className="print-target w-[300px] p-2 font-mono text-xs text-black">
      <div className="text-center">
        {/* next/image can't optimize a blob: URL, see LogoMark. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl && <img src={logoUrl} alt="" className="mx-auto mb-1 h-10 w-10 object-contain" />}
        <p className="font-bold">{displayName || companyName}</p>
        {storeName && <p>{storeName}</p>}
        <p>Sale receipt</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>{createdAt.toLocaleDateString('pt-BR')}</span>
        <span>{createdAt.toLocaleTimeString('pt-BR')}</span>
      </div>
      <p>Sale: {sale.id.slice(0, 8)}</p>

      <div className="my-2 border-t border-dashed border-black" />

      {sale.items.map((item) => (
        <div key={item.id} className="mb-1">
          <p>{item.productName}</p>
          <div className="flex justify-between">
            <span>
              {item.quantity} x {formatCentsToBRL(item.unitPriceCents)}
            </span>
            <span>{formatCentsToBRL(item.totalCents)}</span>
          </div>
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatCentsToBRL(sale.subtotalCents)}</span>
      </div>
      {sale.discountCents > 0 && (
        <div className="flex justify-between">
          <span>Discount</span>
          <span>-{formatCentsToBRL(sale.discountCents)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>{formatCentsToBRL(sale.totalCents)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      {sale.payments.map((payment) => (
        <div key={payment.id} className="flex justify-between">
          <span>{PAYMENT_LABELS[payment.method]}</span>
          <span>{formatCentsToBRL(payment.amountCents)}</span>
        </div>
      ))}

      {sale.fiscalDocument?.status === 'authorized' && sale.fiscalDocument.accessKey && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="break-all">NFC-e: {sale.fiscalDocument.accessKey}</p>
        </>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">Thank you for your business!</p>
    </div>
  );
}
