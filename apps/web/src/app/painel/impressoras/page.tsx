'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { Store, UpdateStoreInput } from '@pcaarb/shared';
import { RECEIPT_PAPER_WIDTHS } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAccessToken } from '@/lib/use-access-token';
import { useCurrentUser } from '@/lib/use-current-user';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { HelpHint } from '@/components/ui/help-hint';

const MM_TO_PX = 96 / 25.4;

interface PrinterDraft {
  receiptPaperWidthMm: 58 | 80;
  receiptAutoPrint: boolean;
  printerLabel: string;
}

function draftFromStore(store: Store): PrinterDraft {
  return {
    receiptPaperWidthMm: store.receiptPaperWidthMm,
    receiptAutoPrint: store.receiptAutoPrint,
    printerLabel: store.printerLabel ?? '',
  };
}

// Thrown on the page just long enough to run a real window.print() at the
// draft's width, without touching the store's saved settings — lets you
// confirm the width is right before relying on it for actual sales.
function TestSlip({ widthMm }: { widthMm: 58 | 80 }) {
  const widthPx = Math.round(widthMm * MM_TO_PX);
  return (
    <div className="print-target p-2 font-mono text-xs text-black" style={{ width: `${widthPx}px` }}>
      <style>{`@page { size: ${widthMm}mm auto; margin: 0; }`}</style>
      <p className="text-center font-bold">Test print</p>
      <p className="text-center">{widthMm}mm</p>
      <div className="my-2 border-t border-dashed border-black" />
      <p>If this lines up with your receipt paper, the width is correct.</p>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789</p>
    </div>
  );
}

function StorePrinterCard({ store, canManage }: { store: Store; canManage: boolean }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PrinterDraft>(() => draftFromStore(store));
  const [testWidth, setTestWidth] = useState<58 | 80 | null>(null);

  // flushSync forces the TestSlip to actually mount before window.print()
  // runs — without it, the print dialog could open on the previous render,
  // before React had committed the new .print-target to the DOM.
  function handleTestPrint() {
    flushSync(() => setTestWidth(draft.receiptPaperWidthMm));
    window.print();
    setTestWidth(null);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<Store>(`/stores/${store.id}`, {
        method: 'PATCH',
        accessToken: accessToken!,
        body: {
          receiptPaperWidthMm: draft.receiptPaperWidthMm,
          receiptAutoPrint: draft.receiptAutoPrint,
          printerLabel: draft.printerLabel.trim() || null,
        } satisfies UpdateStoreInput,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Printer settings saved');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Error saving printer settings');
    },
  });

  const hasChanges =
    draft.receiptPaperWidthMm !== store.receiptPaperWidthMm ||
    draft.receiptAutoPrint !== store.receiptAutoPrint ||
    draft.printerLabel !== (store.printerLabel ?? '');

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Printer className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-medium">{store.name}</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-sm">
            Paper width
            <HelpHint>
              The two standard thermal roll widths sold in Brazil. Pick whichever your printer is loaded with — a
              wrong width prints too narrow or gets cut off on the right.
            </HelpHint>
          </label>
          <Select
            disabled={!canManage}
            value={draft.receiptPaperWidthMm}
            onChange={(e) =>
              setDraft((d) => ({ ...d, receiptPaperWidthMm: Number(e.target.value) as 58 | 80 }))
            }
          >
            {RECEIPT_PAPER_WIDTHS.map((width) => (
              <option key={width} value={width}>
                {width}mm
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm">Printer label (optional)</label>
          <Input
            disabled={!canManage}
            placeholder="E.g.: Register 1"
            value={draft.printerLabel}
            onChange={(e) => setDraft((d) => ({ ...d, printerLabel: e.target.value }))}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent"
          disabled={!canManage}
          checked={draft.receiptAutoPrint}
          onChange={(e) => setDraft((d) => ({ ...d, receiptAutoPrint: e.target.checked }))}
        />
        Print automatically when a sale finalizes
        <HelpHint>
          Opens the Windows print dialog right after a sale completes, instead of waiting for a manual click on
          &ldquo;Print receipt&rdquo;. You still confirm the print in the dialog — this only skips the extra click.
        </HelpHint>
      </label>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={handleTestPrint}>
          Test print
        </Button>
        {canManage && (
          <Button
            type="button"
            loading={saveMutation.isPending}
            disabled={!hasChanges}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        )}
      </div>

      {testWidth !== null && <TestSlip widthMm={testWidth} />}
    </Card>
  );
}

export default function ImpressorasPage() {
  const accessToken = useAccessToken();
  const meQuery = useCurrentUser();
  const canManage = meQuery.data?.user.role === 'owner' || meQuery.data?.user.role === 'admin';

  const storesQuery = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiFetch<Store[]>('/stores', { accessToken: accessToken! }),
    enabled: !!accessToken,
  });

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Printers</h1>
      <p className="max-w-2xl text-sm text-muted">
        Settings for the thermal receipt printer at each store&rsquo;s checkout counter — connected via USB with its
        Windows driver installed. This only affects the printed courtesy copy of a sale; it never changes the NFC-e
        itself, which is issued electronically regardless of these settings.
      </p>

      {!storesQuery.data ? null : storesQuery.data.length === 0 ? (
        <Card>
          <EmptyState icon={Printer} message="No stores yet." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {storesQuery.data.map((store) => (
            <StorePrinterCard key={store.id} store={store} canManage={canManage} />
          ))}
        </div>
      )}
    </>
  );
}
