import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface HelpSection {
  id: string;
  title: string;
  href: string;
  body: string[];
}

const SECTIONS: HelpSection[] = [
  {
    id: 'pdv',
    title: 'POS',
    href: '/painel/pdv',
    body: [
      'Ring up sales for the currently open cash register. A register must be opened before any sale — opening records the starting cash amount.',
      '"No connection" and the offline banner mean sales are being saved on this device and will sync automatically once the internet returns. If a synced sale "needs attention", something changed since it was made (usually stock or price) and it could not be applied automatically — check it and resolve manually.',
      'Closing the register compares your physically counted cash against the expected balance (opening amount + cash sales + deposits − withdrawals) and records any difference.',
    ],
  },
  {
    id: 'produtos',
    title: 'Products',
    href: '/painel/produtos',
    body: [
      'Your product and category catalog. Stock tracking is per product — a product with tracking off never blocks a sale for insufficient stock.',
    ],
  },
  {
    id: 'vendas',
    title: 'Sales',
    href: '/painel/vendas',
    body: [
      'Every completed sale, with receipt reprint and returns/refunds. A partial return keeps the sale marked "completed" but deducts the returned amount from every revenue report — the original transaction record is never altered.',
    ],
  },
  {
    id: 'contagens',
    title: 'Inventory',
    href: '/painel/contagens',
    body: [
      'Physical stock counts — enter what is actually on the shelf. Finalizing a count reconciles it against the current system balance (not the balance from when the count was opened) and adjusts stock to match.',
    ],
  },
  {
    id: 'compras',
    title: 'Purchases',
    href: '/painel/compras',
    body: [
      'Purchase orders to suppliers. A draft order does not affect stock or cost — only receiving it does, at which point it also updates the product’s average cost.',
    ],
  },
  {
    id: 'cadastros',
    title: 'Customers & Suppliers',
    href: '/painel/cadastros',
    body: ['The people you sell to and the businesses you buy from — shared across every module (sales, purchases, loyalty, finance).'],
  },
  {
    id: 'fidelidade',
    title: 'Loyalty',
    href: '/painel/fidelidade',
    body: ['The points program — how customers earn points on purchases and redeem them for a discount on a future sale.'],
  },
  {
    id: 'financeiro',
    title: 'Finance',
    href: '/painel/financeiro',
    body: [
      'Accounts payable (money you owe) and receivable (money owed to you), plus a simplified cash-basis profit & loss. Cost centers let you tag entries to see where money is actually going.',
    ],
  },
  {
    id: 'relatorios',
    title: 'Reports',
    href: '/painel/relatorios',
    body: ['Revenue, seller/store/product ranking, ABC curve, and stock reports — all figures already account for returns.'],
  },
  {
    id: 'comissoes',
    title: 'Seller commissions',
    href: '/painel/comissoes',
    body: ['A default commission rate applies to every seller; an individual rate, if set, overrides it. Commission is calculated on net revenue (after returns).'],
  },
  {
    id: 'lojas',
    title: 'Stores',
    href: '/painel/lojas',
    body: ['The physical stores under this account. Operating more than one active store at a time requires the Multi-store plan.'],
  },
  {
    id: 'integracoes',
    title: 'Integrations',
    href: '/painel/integracoes',
    body: [
      'API keys let an external system call the PCAARB API directly, acting with the same permissions as the role you assign it — never give out a key with more access than the integration actually needs.',
      'Webhooks notify an external URL when something happens (e.g. a sale completes). Each delivery is signed — verify the signature with the endpoint’s signing secret before trusting the payload.',
      'Marketplace channels connect e-commerce platforms to publish products and import orders, keeping stock consistent between the POS and online sales.',
    ],
  },
  {
    id: 'usuarios',
    title: 'Users',
    href: '/painel/usuarios',
    body: [
      'Owner: full access, including billing and the audit log. Admin: everything except billing/audit. Financeiro: accounts payable/receivable and cost centers, read-only elsewhere. Operador de caixa: sales and cash sessions only.',
      'Permission overrides grant or revoke one specific action for one user, on top of their role. Use them for genuine exceptions — if several people need the same access, changing their role is usually the better fit.',
    ],
  },
  {
    id: 'empresa',
    title: 'Company',
    href: '/painel/empresa',
    body: ['Logo and trade name shown on the topbar, the POS screen, and printed documents. Fiscal documents always use the legally registered company name instead, regardless of this setting.'],
  },
  {
    id: 'assinatura',
    title: 'Subscription',
    href: '/painel/assinatura',
    body: [
      'Your current plan, billing history, and plan changes. Switching plans charges the new price immediately and restarts the billing cycle from that day — it is not prorated against the plan you were switching from.',
    ],
  },
  {
    id: 'auditoria',
    title: 'Audit Log',
    href: '/painel/auditoria',
    body: ['A record of sensitive actions — role changes, permissions, subscription, returns, password resets, account lockouts. Visible to the owner only, and cannot be delegated.'],
  },
];

export default function AjudaPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
      <p className="text-sm text-muted">What each part of PCAARB does, in plain language. Jump to a section:</p>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {section.title}
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <Card key={section.id} id={section.id} className="flex scroll-mt-20 flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{section.title}</h2>
              <Link href={section.href} className="text-xs text-accent hover:underline">
                Open →
              </Link>
            </div>
            {section.body.map((paragraph, index) => (
              <p key={index} className="text-sm text-muted">
                {paragraph}
              </p>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}
