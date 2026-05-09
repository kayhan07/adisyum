import { useProductMappingStore } from '@/lib/pos-mapping-store';
import { useEffect, useState } from 'react';

export function ProductMappingErrorAlert() {
  const { errors, warnings, clearErrors, clearWarnings } = useProductMappingStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (errors.length > 0 || warnings.length > 0) {
      setIsOpen(true);
    }
  }, [errors, warnings]);

  if (!isOpen || (errors.length === 0 && warnings.length === 0)) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md z-50 space-y-3">
      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-red-600 text-lg">✕</div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">
                Ürün Eşleştirme Hatası
              </h3>
              <ul className="space-y-1">
                {errors.map((error) => (
                  <li key={error.productId} className="text-sm text-red-800">
                    <strong>{error.productName}:</strong> {error.message}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    clearErrors();
                  }}
                  className="text-xs px-3 py-1 bg-red-200 hover:bg-red-300 text-red-900 rounded"
                >
                  Kapat
                </button>
                <a
                  href="/integrations/pos-mappings"
                  className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Eşleştirmeleri Yönet
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-yellow-600 text-lg">⚠</div>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 mb-2">
                Uyarı
              </h3>
              <ul className="space-y-1">
                {warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-800">
                    {warning}
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <button
                  onClick={() => {
                    clearWarnings();
                  }}
                  className="text-xs px-3 py-1 bg-yellow-200 hover:bg-yellow-300 text-yellow-900 rounded"
                >
                  Anladım
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
