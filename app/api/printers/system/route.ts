import { execFile } from 'node:child_process';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RawWindowsPrinter = {
  Name?: string;
  DriverName?: string;
  PortName?: string;
  PrinterStatus?: number | string;
  Shared?: boolean;
};

function inferConnectionType(portName = '') {
  const normalized = portName.toLocaleLowerCase('tr-TR');
  if (normalized.includes('usb') || normalized.includes('dot4')) return 'usb';
  if (normalized.includes('ip_') || normalized.includes('tcp') || /\d+\.\d+\.\d+\.\d+/.test(normalized)) return 'network';
  return 'usb';
}

function extractIp(portName = '') {
  const match = portName.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return match?.[1] ?? '';
}

function runPowerShell(command: string) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 10000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout);
      },
    );
  });
}

export async function GET() {
  try {
    let output = '';

    try {
      output = await runPowerShell(
        "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared | ConvertTo-Json -Depth 3",
      );
    } catch {
      output = await runPowerShell(
        "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared | ConvertTo-Json -Depth 3",
      );
    }

    const parsed = output.trim() ? JSON.parse(output) : [];
    const rows: RawWindowsPrinter[] = Array.isArray(parsed) ? parsed : [parsed];

    return NextResponse.json({
      printers: rows
        .filter((printer) => printer.Name)
        .map((printer) => ({
          name: printer.Name ?? '',
          driverName: printer.DriverName ?? '',
          portName: printer.PortName ?? '',
          status: String(printer.PrinterStatus ?? ''),
          shared: Boolean(printer.Shared),
          connectionType: inferConnectionType(printer.PortName),
          ip: extractIp(printer.PortName),
        })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        printers: [],
        error: error instanceof Error ? error.message : 'Sistem yazıcıları okunamadı.',
      },
      { status: 200 },
    );
  }
}
