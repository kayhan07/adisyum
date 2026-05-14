const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const iconv = require('iconv-lite');

const app = express();
const HTTP_PORT = Number(process.env.PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const printerQueues = new Map();
let printJobCounter = 0;
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

app.get('/printers', (req, res) => {
  exec(
    'powershell -Command "Get-Printer | Select-Object Name | ConvertTo-Json"',
    (error, stdout) => {
      if (error) return res.status(500).send(error.message || String(error));

      try {
        const data = JSON.parse(stdout);
        const printers = Array.isArray(data)
          ? data.map((p) => p.Name).filter(Boolean)
          : [data.Name].filter(Boolean);

        res.json(printers);
      } catch {
        res.status(500).send('Parse error');
      }
    },
  );
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
      } catch {
        // noop
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
