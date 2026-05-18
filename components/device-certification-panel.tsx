import { certificationSummary, DEVICE_CERTIFICATION_MATRIX } from '@/lib/device-certification';

export function DeviceCertificationPanel() {
  const summary = certificationSummary();

  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Cihaz sertifikasyon matrisi</h2>
          <p className="mt-1 text-sm text-muted">Sahada desteklenen cihazları ve son doğrulama durumlarını izleyin.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(summary).map(([status, count]) => (
            <span key={status} className="rounded-full border border-line px-3 py-1.5 text-muted">{status}: {count}</span>
          ))}
        </div>
      </div>
      <div className="mt-5 overflow-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-muted">
            <tr>{['Kategori', 'Vendor / Model', 'Sürücü', 'Bağlantı', 'Durum', 'Son doğrulama'].map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
          </thead>
          <tbody>
            {DEVICE_CERTIFICATION_MATRIX.map((device) => (
              <tr key={`${device.category}-${device.vendor}-${device.model}`} className="border-t border-line">
                <td className="px-3 py-3">{device.category}</td>
                <td className="px-3 py-3"><p className="font-semibold text-ink">{device.vendor}</p><p className="text-muted">{device.model}</p></td>
                <td className="px-3 py-3">{device.driverType}</td>
                <td className="px-3 py-3">{device.connectionType}</td>
                <td className="px-3 py-3">{device.status}</td>
                <td className="px-3 py-3">{device.lastValidatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
