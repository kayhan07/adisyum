const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const iconv = require('iconv-lite');

const app = express();
const HTTP_PORT = Number(process.env.PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const printerQueues = new Map();
let printJobCounter = 0;
const CACHE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'AdisyumPosAgent');
const PRINTER_CACHE_PATH = path.join(CACHE_DIR, 'printer-cache.json');
const ALLOWED_PRINT_SOURCES = [
  'receipt-formatter:',
  'proxy:',
  'delivery:printDeliveryReceipt',
  'order-composer:sendLocalAgentPrint',
  'standard-mode-test',
  'final-validation',
  'diag-',
];

app.use(express.json({ limit: '2mb' }));

// Manual CORS + PNA (Private Network Access) handling
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // CRITICAL: Always set PNA header for loopback addresses, especially for OPTIONS preflight
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  
  // Handle OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

function runCommand(command, timeout = 12000) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr && stderr.trim()) || error.message || String(error)));
        return;
      }

      resolve(String(stdout || ''));
    });
  });
}

function runPowerShell(script, timeout = 12000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return runCommand(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, timeout);
}

function parseJsonRows(output) {
  const trimmed = String(output || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function inferConnectionType(portName = '', printerName = '') {
  const normalized = `${portName} ${printerName}`.toLowerCase();
  if (normalized.includes('usb') || normalized.includes('dot4')) return 'usb';
  if (normalized.includes('ip_') || normalized.includes('tcp') || /\d+\.\d+\.\d+\.\d+/.test(normalized)) return 'network';
  if (normalized.includes('nul') || normalized.includes('file:')) return 'virtual';
  if (normalized.includes('share') || normalized.startsWith('\\\\')) return 'shared';
  return 'local';
}

function isEscPosCandidate(name = '', driverName = '') {
  const normalized = `${name} ${driverName}`.toLowerCase();
  return ['thermal', 'receipt', 'pos', 'esc', 'epson', 'xprinter', 'bixolon', 'star', 'citizen', 'rongta', 'sunmi'].some((token) =>
    normalized.includes(token),
  );
}

function normalizePrinter(row, source) {
  const name = String(row.Name ?? row.name ?? '').trim();
  if (!name) return null;

  const driverName = String(row.DriverName ?? row.driverName ?? '').trim();
  const portName = String(row.PortName ?? row.portName ?? '').trim();
  const rawStatus = row.PrinterStatus ?? row.Status ?? row.status ?? '';
  const workOffline = Boolean(row.WorkOffline ?? row.workOffline ?? false);
  const online = !workOffline && !['7', 'Offline', 'Error'].includes(String(rawStatus));

  return {
    name,
    driverName,
    portName,
    status: String(rawStatus || (online ? 'Ready' : 'Unknown')),
    shared: Boolean(row.Shared ?? row.shared ?? false),
    default: Boolean(row.Default ?? row.default ?? false),
    workOffline,
    online,
    connectionType: inferConnectionType(portName, name),
    escpos: isEscPosCandidate(name, driverName),
    source,
    discoveredAt: new Date().toISOString(),
  };
}

async function getSpoolerStatus() {
  if (process.platform !== 'win32') {
    return { ok: false, status: 'unsupported', message: 'Windows spooler is only available on Windows.' };
  }

  try {
    const rows = parseJsonRows(await runPowerShell("Get-Service Spooler | Select-Object Name,Status | ConvertTo-Json -Depth 2", 8000));
    const status = rows[0]?.Status ? String(rows[0].Status) : 'Unknown';
    return { ok: status.toLowerCase() === 'running', status };
  } catch (error) {
    return { ok: false, status: 'unknown', error: error.message || String(error) };
  }
}

function readPrinterCache() {
  try {
    if (!fs.existsSync(PRINTER_CACHE_PATH)) return null;
    const cache = JSON.parse(fs.readFileSync(PRINTER_CACHE_PATH, 'utf8'));
    if (!Array.isArray(cache.printers)) return null;
    return cache;
  } catch (error) {
    console.warn('[adisyum-print] PRINTER_CACHE_READ_FAILED', { error: error.message || String(error) });
    return null;
  }
}

function writePrinterCache(printers, diagnostics) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      PRINTER_CACHE_PATH,
      JSON.stringify({ savedAt: new Date().toISOString(), printers, diagnostics }, null, 2),
      'utf8',
    );
  } catch (error) {
    console.warn('[adisyum-print] PRINTER_CACHE_WRITE_FAILED', { error: error.message || String(error) });
  }
}

async function discoverPrinters() {
  const diagnostics = {
    platform: process.platform,
    hostname: os.hostname(),
    cachePath: PRINTER_CACHE_PATH,
    methods: [],
    spooler: await getSpoolerStatus(),
  };

  if (process.platform !== 'win32') {
    const cache = readPrinterCache();
    return {
      ok: false,
      cached: Boolean(cache),
      printers: cache?.printers ?? [],
      diagnostics,
      error: 'Printer discovery requires Windows.',
    };
  }

  const methods = [
    {
      name: 'Get-Printer',
      script: "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,Type | ConvertTo-Json -Depth 4",
    },
    {
      name: 'Win32_Printer',
      script: "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,WorkOffline,Default | ConvertTo-Json -Depth 4",
    },
    {
      name: 'WMI-Object',
      script: "Get-WmiObject Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,WorkOffline,Default | ConvertTo-Json -Depth 4",
    },
  ];

  const discovered = new Map();

  for (const method of methods) {
    try {
      const rows = parseJsonRows(await runPowerShell(method.script));
      let accepted = 0;
      for (const row of rows) {
        const printer = normalizePrinter(row, method.name);
        if (!printer) continue;
        const key = printer.name.toLowerCase();
        const existing = discovered.get(key);
        discovered.set(key, existing ? { ...printer, ...existing, default: existing.default || printer.default } : printer);
        accepted += 1;
      }
      diagnostics.methods.push({ name: method.name, ok: true, count: accepted });
    } catch (error) {
      diagnostics.methods.push({ name: method.name, ok: false, error: error.message || String(error) });
    }
  }

  const printers = Array.from(discovered.values()).sort((a, b) => {
    if (a.default && !b.default) return -1;
    if (!a.default && b.default) return 1;
    return a.name.localeCompare(b.name, 'tr');
  });

  if (printers.length > 0) {
    writePrinterCache(printers, diagnostics);
    console.log('[adisyum-print] PRINTER_DISCOVERY_OK', { count: printers.length, methods: diagnostics.methods });
    return { ok: true, cached: false, printers, diagnostics };
  }

  const cache = readPrinterCache();
  console.warn('[adisyum-print] PRINTER_DISCOVERY_EMPTY', { methods: diagnostics.methods, cached: Boolean(cache) });
  return {
    ok: false,
    cached: Boolean(cache),
    printers: cache?.printers ?? [],
    diagnostics,
    error: 'No Windows printers discovered. Returned cache if available.',
  };
}

app.get('/health', async (_req, res) => {
  const discovery = await discoverPrinters();
  res.json({
    ok: true,
    service: 'adisyum-pos-agent',
    version: process.env.npm_package_version || 'local',
    uptimeSeconds: Math.round(process.uptime()),
    queueCount: printerQueues.size,
    printers: discovery.printers,
    spooler: discovery.diagnostics.spooler,
    diagnostics: discovery.diagnostics,
    cached: discovery.cached,
    error: discovery.error,
  });
});

app.get('/printers', async (_req, res) => {
  const discovery = await discoverPrinters();
  res.json(discovery.printers);
});

function printRawToWindowsPrinter(printerName, rawBuffer) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'adisyum-print-'));
    const dataPath = path.join(tempDir, 'print.bin');
    const scriptPath = path.join(tempDir, 'raw-print.ps1');

    const escposBuffer = Buffer.isBuffer(rawBuffer)
      ? rawBuffer
      : Buffer.from(rawBuffer);
    fs.writeFileSync(dataPath, escposBuffer);

    const safePrinterName = String(printerName).replace(/'/g, "''");
    const safeDataPath = dataPath.replace(/'/g, "''");

    const script = `
$ErrorActionPreference = 'Stop'
$printerName = '${safePrinterName}'
$filePath = '${safeDataPath}'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, DOCINFO di);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@

$bytes = [System.IO.File]::ReadAllBytes($filePath)
if (-not $bytes -or $bytes.Length -le 0) {
  throw 'ESC/POS data boş.'
}

$hPrinter = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
  throw "OpenPrinter failed. LastError=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

try {
  $doc = New-Object RawPrinter+DOCINFO
  $doc.pDocName = 'Adisyum ESCPOS RAW'
  $doc.pDataType = 'RAW'

  if (-not [RawPrinter]::StartDocPrinter($hPrinter, 1, $doc)) {
    throw "StartDocPrinter failed. LastError=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }

  try {
    if (-not [RawPrinter]::StartPagePrinter($hPrinter)) {
      throw "StartPagePrinter failed. LastError=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }

    try {
      $written = 0
      if (-not [RawPrinter]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) {
        throw "WritePrinter failed. LastError=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
      }

      if ($written -ne $bytes.Length) {
        throw "Eksik yazım: $written/$($bytes.Length) byte"
      }
    }
    finally {
      [void][RawPrinter]::EndPagePrinter($hPrinter)
    }
  }
  finally {
    [void][RawPrinter]::EndDocPrinter($hPrinter)
  }
}
finally {
  [void][RawPrinter]::ClosePrinter($hPrinter)
}

Write-Output "RAW_PRINT_OK bytes=$($bytes.Length)"
`;

    fs.writeFileSync(scriptPath, script, 'utf8');

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, (error, stdout, stderr) => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('[adisyum-print] TEMP_CLEANUP_FAILED', { error: cleanupError.message || String(cleanupError) });
      }

      if (error) {
        return reject(new Error((stderr && stderr.trim()) || (stdout && stdout.trim()) || error.message || String(error)));
      }
      resolve({ stdout, stderr, bytes: escposBuffer.length, writeCalls: 1, printJobs: 1 });
    });
  });
}

function enqueuePrinterJob(printerName, worker) {
  const queueKey = String(printerName).trim().toLowerCase();
  const previous = printerQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(worker)
    .finally(() => {
      if (printerQueues.get(queueKey) === next) {
        printerQueues.delete(queueKey);
      }
    });

  printerQueues.set(queueKey, next);
  return next;
}

function isAllowedPrintSource(source) {
  const normalized = String(source ?? '').trim();
  if (!normalized) return false;
  return ALLOWED_PRINT_SOURCES.some((prefix) => normalized.startsWith(prefix));
}

function purgePrinterQueue(printerName) {
  return new Promise((resolve, reject) => {
    const safePrinterName = String(printerName).replace(/'/g, "''");
    const command = `powershell -NoProfile -Command "Get-PrintJob -PrinterName '${safePrinterName}' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue; Write-Output 'QUEUE_PURGED'"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error((stderr && stderr.trim()) || (stdout && stdout.trim()) || error.message || String(error)));
      }
      resolve({ stdout, stderr });
    });
  });
}

app.post('/print', (req, res) => {
  const printerName = typeof req.body?.printerName === 'string' ? req.body.printerName.trim() : '';
  const bytesBase64 = typeof req.body?.bytesBase64 === 'string' ? req.body.bytesBase64 : '';
  const source = typeof req.body?.source === 'string' ? req.body.source : 'unknown-source';
  const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'raw';

  if (!isAllowedPrintSource(source)) {
    return res.status(403).json({ error: `Geçersiz print source: ${source}` });
  }

  if (!printerName || !bytesBase64) {
    return res.status(400).json({ error: 'printerName ve bytesBase64 zorunlu.' });
  }

  discoverPrinters()
    .then((discovery) => {
      const known = discovery.printers.some((printer) => printer.name.toLowerCase() === printerName.toLowerCase());
      if (!known) {
        console.warn('[adisyum-print] PRINT_TARGET_NOT_DISCOVERED', {
          printerName,
          discoveredCount: discovery.printers.length,
          cached: discovery.cached,
        });
      }
    })
    .catch((error) => {
      console.warn('[adisyum-print] PRINT_PREFLIGHT_DISCOVERY_FAILED', { printerName, error: error.message || String(error) });
    });

  if (mode !== 'raw') {
    return res.status(400).json({ error: 'Sadece RAW ESC/POS desteklenir. mode="raw" gönderin.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(bytesBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Geçersiz bytesBase64 verisi.' });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: 'Yazdırılacak RAW buffer boş.' });
  }

  const jobId = `${printerName}-${Date.now()}-${++printJobCounter}`;

  console.log('[adisyum-print] REQUEST_RECEIVED', {
    jobId,
    printerName,
    mode,
    source,
    payload: 'bytesBase64',
    byteLength: buffer.length,
    sendCalls: 1,
  });

  enqueuePrinterJob(printerName, async () => {
    console.log('[adisyum-print] PRINT_START', {
      jobId,
      printerName,
      queueMode: 'single-job-lock',
      queueDepth: printerQueues.size,
    });

    console.log('[adisyum-print] PRINT_EXECUTE', {
      jobId,
      printerName,
      executeCalls: 1,
    });

    try {
      await purgePrinterQueue(printerName);
      console.log('[adisyum-print] QUEUE_PURGED', { jobId, printerName });
    } catch (purgeError) {
      console.log('[adisyum-print] QUEUE_PURGE_FAILED', {
        jobId,
        printerName,
        error: purgeError instanceof Error ? purgeError.message : String(purgeError),
      });
    }

    const result = await printRawToWindowsPrinter(printerName, buffer);
    buffer.fill(0);

    console.log('[adisyum-print] PRINT_END', {
      jobId,
      printerName,
      bytes: result.bytes,
      printJobs: result.printJobs,
      writeCalls: result.writeCalls,
      bufferCleared: true,
    });

    return result;
  })
    .then((result) => {
      console.log('[adisyum-print] WRITE_COMPLETE', {
        jobId,
        printerName,
        mode: 'raw',
        bytes: result.bytes,
        printJobs: result.printJobs,
        writeCalls: result.writeCalls,
      });
      res.json({
        success: true,
        jobId,
        printerName,
        printed: true,
        mode: 'raw',
        bytes: result.bytes,
        printJobs: result.printJobs,
        writeCalls: result.writeCalls,
      });
    })
    .catch((error) => {
      res.status(500).json({ error: error.message || String(error) });
    });
});

app.listen(HTTP_PORT, () => {
  console.log(`Adisyum POS Agent HTTP running at http://127.0.0.1:${HTTP_PORT} and http://localhost:${HTTP_PORT}`);
});

// HTTPS support using PFX certificate (created by PowerShell)
const pfxPath = process.env.AGENT_TLS_PFX || path.join(__dirname, 'certs', 'localhost.pfx');
const pfxPassword = process.env.AGENT_TLS_PFX_PASSWORD || 'adisyum';

if (fs.existsSync(pfxPath)) {
  try {
    const pfxData = fs.readFileSync(pfxPath);
    // PFX can be used directly with https.createServer in Node.js if password provided
    // However, modern Node.js prefers PEM format. For now, use pfx option:
    https.createServer({ 
      pfx: pfxData,
      passphrase: pfxPassword
    }, app).listen(HTTPS_PORT, () => {
      console.log(`Adisyum POS Agent HTTPS running at https://localhost:${HTTPS_PORT}`);
    });
  } catch (err) {
    console.log('HTTPS initialization failed:', err.message);
    console.log('Continuing with HTTP only mode...');
  }
} else {
  console.log(`Note: HTTPS not available. PFX file not found at: ${pfxPath}`);
}
