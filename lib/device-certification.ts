export type CertificationStatus = 'Certified' | 'Beta' | 'Experimental' | 'Unsupported';
export type DeviceCategory = 'thermal_printer' | 'kitchen_printer' | 'fiscal_pos' | 'barcode_scanner' | 'cash_drawer';

export type DeviceCertificationRecord = {
  category: DeviceCategory;
  vendor: string;
  model: string;
  driverType: string;
  connectionType: string;
  status: CertificationStatus;
  knownIssues: string[];
  lastValidatedAt: string;
};

export const DEVICE_CERTIFICATION_MATRIX: DeviceCertificationRecord[] = [
  {
    category: 'thermal_printer',
    vendor: 'Epson',
    model: 'TM-T20III',
    driverType: 'ESC/POS + Windows spooler',
    connectionType: 'USB / Ethernet',
    status: 'Certified',
    knownIssues: [],
    lastValidatedAt: '2026-05-19',
  },
  {
    category: 'kitchen_printer',
    vendor: 'Xprinter',
    model: 'XP-Q200',
    driverType: 'ESC/POS',
    connectionType: 'Ethernet',
    status: 'Beta',
    knownIssues: ['Cold boot sonrası ilk heartbeat gecikebilir.'],
    lastValidatedAt: '2026-05-19',
  },
  {
    category: 'fiscal_pos',
    vendor: 'Generic',
    model: 'Vendor SDK adapter',
    driverType: 'DLL / COM / TCP',
    connectionType: 'Serial / Socket / USB bridge',
    status: 'Experimental',
    knownIssues: ['Vendor sertifikasyonu modele göre tamamlanmalı.'],
    lastValidatedAt: '2026-05-19',
  },
  {
    category: 'barcode_scanner',
    vendor: 'Honeywell',
    model: 'Voyager 1250g',
    driverType: 'HID keyboard',
    connectionType: 'USB',
    status: 'Beta',
    knownIssues: [],
    lastValidatedAt: '2026-05-19',
  },
  {
    category: 'cash_drawer',
    vendor: 'Generic',
    model: 'RJ11 printer pulse drawer',
    driverType: 'ESC/POS pulse',
    connectionType: 'Printer passthrough',
    status: 'Beta',
    knownIssues: ['Pulse süresi yazıcı modeline göre doğrulanmalı.'],
    lastValidatedAt: '2026-05-19',
  },
];

export function certificationSummary() {
  return DEVICE_CERTIFICATION_MATRIX.reduce<Record<CertificationStatus, number>>((summary, item) => {
    summary[item.status] += 1;
    return summary;
  }, { Certified: 0, Beta: 0, Experimental: 0, Unsupported: 0 });
}
