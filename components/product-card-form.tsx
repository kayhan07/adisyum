'use client';

import type { ReactNode } from 'react';

type CardItemType = 'sale' | 'raw';
type RawUnit = 'kg' | 'lt' | 'adet';
type SaleUnitType = 'portion' | 'kg' | 'bottle' | 'glass';
type VatRate = 1 | 10 | 20;

type ProductCardFormProps = {
  eyebrow: string;
  title: string;
  description: string;
  closeLabel?: string;
  onClose: () => void;
  itemType: CardItemType;
  onItemTypeChange: (value: CardItemType) => void;
  itemTypeOptions?: CardItemType[];
  name: string;
  onNameChange: (value: string) => void;
  barcode?: string;
  onBarcodeChange?: (value: string) => void;
  showBarcode?: boolean;
  category?: string;
  onCategoryChange?: (value: string) => void;
  categoryOptions?: string[];
  salePrice?: string;
  onSalePriceChange?: (value: string) => void;
  saleUnit?: SaleUnitType;
  onSaleUnitChange?: (value: SaleUnitType) => void;
  purchasePrice?: string;
  onPurchasePriceChange?: (value: string) => void;
  showPurchasePrice?: boolean;
  unit?: RawUnit;
  onUnitChange?: (value: RawUnit) => void;
  minimumQuantity?: string;
  onMinimumQuantityChange?: (value: string) => void;
  currentQuantity?: string;
  onCurrentQuantityChange?: (value: string) => void;
  showCurrentQuantity?: boolean;
  vatRate?: VatRate;
  onVatRateChange?: (value: VatRate) => void;
  showVat?: boolean;
  newCategoryName?: string;
  onNewCategoryNameChange?: (value: string) => void;
  categoryCount?: number;
  onCreateCategory?: () => void;
  submitLabel: string;
  onSubmit: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
};

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-sm text-slate-400">{children}</span>;
}

function InputShell({ children }: { children: ReactNode }) {
  return <div className="mt-2">{children}</div>;
}

export function ProductCardForm({
  eyebrow,
  title,
  description,
  closeLabel = 'Kapat',
  onClose,
  itemType,
  onItemTypeChange,
  itemTypeOptions = ['sale', 'raw'],
  name,
  onNameChange,
  barcode = '',
  onBarcodeChange,
  showBarcode = false,
  category = '',
  onCategoryChange,
  categoryOptions,
  salePrice = '',
  onSalePriceChange,
  saleUnit = 'portion',
  onSaleUnitChange,
  purchasePrice = '',
  onPurchasePriceChange,
  showPurchasePrice = false,
  unit = 'adet',
  onUnitChange,
  minimumQuantity = '',
  onMinimumQuantityChange,
  currentQuantity = '',
  onCurrentQuantityChange,
  showCurrentQuantity = false,
  vatRate = 20,
  onVatRateChange,
  showVat = false,
  newCategoryName = '',
  onNewCategoryNameChange,
  categoryCount,
  onCreateCategory,
  submitLabel,
  onSubmit,
  cancelLabel = 'Vazgeç',
  onCancel,
}: ProductCardFormProps) {
  const saleUsesSelect = Boolean(categoryOptions?.length);

  return (
    <section className="rounded-[1.75rem] border border-blue-400/20 bg-[#13213A] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_38px_rgba(59,130,246,0.12)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          {closeLabel}
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <label className="block">
          <FieldLabel>Kart tipi</FieldLabel>
          <InputShell>
            <select
              value={itemType}
              onChange={(event) => onItemTypeChange(event.target.value as CardItemType)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
            >
              {itemTypeOptions.includes('sale') ? <option value="sale">Satış ürünü</option> : null}
              {itemTypeOptions.includes('raw') ? <option value="raw">Hammadde</option> : null}
            </select>
          </InputShell>
        </label>

        <label className="block">
          <FieldLabel>Kart adı</FieldLabel>
          <InputShell>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
            />
          </InputShell>
        </label>

        {showBarcode ? (
          <label className="block">
            <FieldLabel>Barkod</FieldLabel>
            <InputShell>
              <input
                value={barcode}
                onChange={(event) => onBarcodeChange?.(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
              />
            </InputShell>
          </label>
        ) : null}
      </div>

      {itemType === 'sale' ? (
        <>
          {onCreateCategory ? (
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
              <label className="block">
                <FieldLabel>Yeni kategori</FieldLabel>
                <InputShell>
                  <input
                    value={newCategoryName}
                    onChange={(event) => onNewCategoryNameChange?.(event.target.value)}
                    placeholder="Örn: Pizza"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                  />
                </InputShell>
              </label>

              <div className="block">
                <FieldLabel>Mevcut kategori sayısı</FieldLabel>
                <div className="mt-2 flex h-12 items-center rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white">
                  {categoryCount ?? 0}
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={onCreateCategory}
                  className="h-12 w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20 active:scale-[0.98]"
                >
                  Kategori oluştur
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <FieldLabel>Kategori</FieldLabel>
              <InputShell>
                {saleUsesSelect ? (
                  <select
                    value={category}
                    onChange={(event) => onCategoryChange?.(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                  >
                    {categoryOptions?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={category}
                    onChange={(event) => onCategoryChange?.(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                  />
                )}
              </InputShell>
            </label>

            {showPurchasePrice ? (
              <label className="block">
                <FieldLabel>Alış fiyatı</FieldLabel>
                <InputShell>
                  <input
                    value={purchasePrice}
                    onChange={(event) => onPurchasePriceChange?.(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                  />
                </InputShell>
              </label>
            ) : null}

            <label className="block">
              <FieldLabel>Satış fiyatı</FieldLabel>
              <InputShell>
                <input
                  value={salePrice}
                  onChange={(event) => onSalePriceChange?.(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                />
              </InputShell>
            </label>

            {onSaleUnitChange ? (
              <label className="block">
                <FieldLabel>Satış tipi</FieldLabel>
                <InputShell>
                  <select
                    value={saleUnit}
                    onChange={(event) => onSaleUnitChange(event.target.value as SaleUnitType)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                  >
                    <option value="portion">Porsiyon bazlı</option>
                    <option value="kg">Kilogram bazlı</option>
                    <option value="bottle">Şişe bazlı</option>
                    <option value="glass">Kadeh bazlı</option>
                  </select>
                </InputShell>
              </label>
            ) : null}

            {showVat ? (
              <label className="block">
                <FieldLabel>KDV</FieldLabel>
                <InputShell>
                  <select
                    value={vatRate}
                    onChange={(event) => onVatRateChange?.(Number(event.target.value) as VatRate)}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                  >
                    <option value={1}>%1</option>
                    <option value={10}>%10</option>
                    <option value={20}>%20</option>
                  </select>
                </InputShell>
              </label>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {showPurchasePrice ? (
            <label className="block">
              <FieldLabel>Alış fiyatı</FieldLabel>
              <InputShell>
                <input
                  value={purchasePrice}
                  onChange={(event) => onPurchasePriceChange?.(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                />
              </InputShell>
            </label>
          ) : null}

          <label className="block">
            <FieldLabel>Birim</FieldLabel>
            <InputShell>
              <select
                value={unit}
                onChange={(event) => onUnitChange?.(event.target.value as RawUnit)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
              >
                <option value="adet">Adet</option>
                <option value="kg">Kg</option>
                <option value="lt">Lt</option>
              </select>
            </InputShell>
          </label>

          {showCurrentQuantity ? (
            <label className="block">
              <FieldLabel>Mevcut stok</FieldLabel>
              <InputShell>
                <input
                  value={currentQuantity}
                  onChange={(event) => onCurrentQuantityChange?.(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                />
              </InputShell>
            </label>
          ) : null}

          <label className="block">
            <FieldLabel>Minimum stok</FieldLabel>
            <InputShell>
              <input
                value={minimumQuantity}
                onChange={(event) => onMinimumQuantityChange?.(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
              />
            </InputShell>
          </label>

          {showVat ? (
            <label className="block">
              <FieldLabel>KDV</FieldLabel>
              <InputShell>
                <select
                  value={vatRate}
                  onChange={(event) => onVatRateChange?.(Number(event.target.value) as VatRate)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0B1220] px-4 font-semibold text-white outline-none"
                >
                  <option value={1}>%1</option>
                  <option value={10}>%10</option>
                  <option value={20}>%20</option>
                </select>
              </InputShell>
            </label>
          ) : null}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSubmit}
          className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

