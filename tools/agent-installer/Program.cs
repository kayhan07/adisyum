using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace AdisyumPosAgentInstaller
{
    // ------------------------------------------------------------------ //
    //  Raw-printer P/Invoke helpers                                        //
    // ------------------------------------------------------------------ //
    internal static class RawPrinter
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public class DOCINFO
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFO di);

        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", SetLastError = true)]
        public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

        /// <summary>Sends a RAW ESC/POS byte array directly to the named Windows printer.</summary>
        public static int SendRaw(string printerName, byte[] data)
        {
            if (data == null || data.Length == 0)
                throw new ArgumentException("ESC/POS data boş.");

            IntPtr hPrinter;
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
                throw new InvalidOperationException("OpenPrinter failed. LastError=" + Marshal.GetLastWin32Error());

            try
            {
                var doc = new DOCINFO
                {
                    pDocName  = "Adisyum ESCPOS RAW",
                    pDataType = "RAW",
                    pOutputFile = null
                };

                if (!StartDocPrinter(hPrinter, 1, doc))
                    throw new InvalidOperationException("StartDocPrinter failed. LastError=" + Marshal.GetLastWin32Error());

                try
                {
                    if (!StartPagePrinter(hPrinter))
                        throw new InvalidOperationException("StartPagePrinter failed. LastError=" + Marshal.GetLastWin32Error());

                    try
                    {
                        int written;
                        if (!WritePrinter(hPrinter, data, data.Length, out written))
                            throw new InvalidOperationException("WritePrinter failed. LastError=" + Marshal.GetLastWin32Error());

                        if (written != data.Length)
                            throw new InvalidOperationException($"Eksik yazım: {written}/{data.Length} byte");

                        return written;
                    }
                    finally { EndPagePrinter(hPrinter); }
                }
                finally { EndDocPrinter(hPrinter); }
            }
            finally { ClosePrinter(hPrinter); }
        }
    }

    internal static class Program
    {
        private const string LocalApiPrefix = "http://127.0.0.1:4891/";
        private const string RunArg = "--run-agent";
        private const string DiagnoseArg = "--diagnose";
        private const string ServiceName = "AdisyumPrinterBridge";
        private const string LegacyServiceName = "AdisyumDesktopBridge";
        private const string ServiceDisplayName = "Adisyum Printer Bridge";
        private const string TaskName = "AdisyumPrinterBridge";
        private const string LegacyTaskName = "AdisyumDesktopBridge";
        private const string BridgeVersion = "0.1.7";
        private static readonly string DeviceIdentityPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Adisyum",
            "DesktopBridge",
            "device-id.txt");
        private static readonly string PrinterCachePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Adisyum",
            "DesktopBridge",
            "printer-cache.json");
        private static readonly string BridgeLogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Adisyum",
            "DesktopBridge",
            "logs",
            "bridge.log");
        private static readonly string DiagnoseScriptPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Adisyum",
            "DesktopBridge",
            "diagnose.bat");

        private static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            if (args != null)
            {
                foreach (var arg in args)
                {
                    if (string.Equals(arg, RunArg, StringComparison.OrdinalIgnoreCase))
                    {
                        RunAgent();
                        return 0;
                    }
                    if (string.Equals(arg, DiagnoseArg, StringComparison.OrdinalIgnoreCase))
                    {
                        PrintDiagnostics();
                        return 0;
                    }
                }
            }

            try
            {
                Console.WriteLine("Adisyum Printer Bridge setup starting...");
                Console.WriteLine("Administrator: " + (IsAdministrator() ? "yes" : "no"));
                InstallAndStartAgent();
                var printers = GetInstalledPrinters();
                Console.WriteLine("Local API: " + LocalApiPrefix);
                Console.WriteLine("Printers discovered: " + printers.Count);
                foreach (var printer in printers.Take(8))
                {
                    Console.WriteLine("- " + printer.Name + " [" + printer.ConnectionType + "] " + (printer.Online ? "online" : "offline"));
                }
                Console.WriteLine("Refresh Adisyum printer integration and scan again.");
                Console.WriteLine("Adisyum POS Agent kuruldu ve başlatıldı.");
                Console.WriteLine("Sayfayı yenileyip agent durumunu kontrol edebilirsiniz.");
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Kurulum hatası: " + ex.Message);
                Console.Error.WriteLine("Log yolu: " + BridgeLogPath);
                return 1;
            }
        }

        private static void InstallAndStartAgent()
        {
            var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            var installDir = Path.Combine(programData, "Adisyum", "DesktopBridge");
            var logsDir = Path.Combine(installDir, "logs");
            Directory.CreateDirectory(installDir);
            Directory.CreateDirectory(logsDir);
            Console.WriteLine("Install dir: " + installDir);

            var currentExe = Process.GetCurrentProcess().MainModule.FileName;
            var targetExe = Path.Combine(installDir, "AdisyumDesktopBridge.exe");

            if (!string.Equals(currentExe, targetExe, StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(currentExe, targetExe, true);
                Console.WriteLine("Bridge copied: " + targetExe);
            }

            EnsureDeviceId();
            WriteDiagnosticScript(targetExe, installDir);
            RegisterStartMenuShortcuts(targetExe, installDir);
            RegisterWindowsService(targetExe);
            RegisterStartupTask(targetExe);

            using (var runKey = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", true))
            {
                if (runKey == null)
                {
                    throw new InvalidOperationException("Windows Run registry key açılamadı.");
                }

                runKey.SetValue(ServiceName, "\"" + targetExe + "\" " + RunArg, RegistryValueKind.String);
            }

            StartServiceOrFallback(targetExe, installDir);
            WaitForHealth();
        }

        private static void RegisterWindowsService(string targetExe)
        {
            if (!IsAdministrator())
            {
                Console.WriteLine("No administrator permission; using user startup fallback.");
                return;
            }

            RunProcess("sc.exe", "stop " + LegacyServiceName, false);
            RunProcess("sc.exe", "delete " + LegacyServiceName, false);
            RunProcess("sc.exe", "stop " + ServiceName, false);
            RunProcess("sc.exe", "delete " + ServiceName, false);
            RunProcess("sc.exe", "create " + ServiceName + " binPath= \"" + targetExe + " " + RunArg + "\" start= auto DisplayName= \"" + ServiceDisplayName + "\"", true);
            RunProcess("sc.exe", "description " + ServiceName + " \"Adisyum local printer, fiscal POS and offline queue bridge\"", false);
            RunProcess("sc.exe", "failure " + ServiceName + " reset= 60 actions= restart/5000/restart/10000/restart/30000", false);
            Console.WriteLine("Windows service registered: " + ServiceName);
        }

        private static void RegisterStartupTask(string targetExe)
        {
            RunProcess("schtasks.exe", "/Delete /TN \"" + LegacyTaskName + "\" /F", false);
            var args = "/Create /TN \"" + TaskName + "\" /TR \"\\\"" + targetExe + "\\\" " + RunArg + "\" /SC ONLOGON /RL HIGHEST /F";
            RunProcess("schtasks.exe", args, false);
            Console.WriteLine("Startup task registered: " + TaskName);
        }

        private static void WriteDiagnosticScript(string targetExe, string installDir)
        {
            var lines = new[]
            {
                "@echo off",
                "chcp 65001 >nul",
                "echo Adisyum Printer Bridge Tanilama",
                "echo.",
                "echo Install dir: " + installDir,
                "echo Health: " + LocalApiPrefix + "health",
                "echo Logs: " + Path.GetDirectoryName(BridgeLogPath),
                "echo.",
                "\"" + targetExe + "\" " + DiagnoseArg,
                "echo.",
                "pause",
            };
            File.WriteAllText(DiagnoseScriptPath, string.Join(Environment.NewLine, lines), Encoding.UTF8);
        }

        private static void RegisterStartMenuShortcuts(string targetExe, string installDir)
        {
            var startMenuRoot = IsAdministrator()
                ? Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)
                : Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
            var startMenuDir = Path.Combine(startMenuRoot, "Programs", "Adisyum");
            Directory.CreateDirectory(startMenuDir);

            CreateShortcut(Path.Combine(startMenuDir, "Adisyum Printer Bridge.lnk"), targetExe, RunArg, installDir, "Adisyum Printer Bridge local agent");
            CreateShortcut(Path.Combine(startMenuDir, "Adisyum Printer Bridge Tanılama.lnk"), DiagnoseScriptPath, string.Empty, installDir, "Adisyum Printer Bridge tanılama");

            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (!string.IsNullOrWhiteSpace(desktop))
            {
                CreateShortcut(Path.Combine(desktop, "Adisyum Printer Bridge.lnk"), targetExe, RunArg, installDir, "Adisyum Printer Bridge local agent");
            }
        }

        private static void CreateShortcut(string linkPath, string targetPath, string arguments, string workingDirectory, string description)
        {
            var script =
                "$shell = New-Object -ComObject WScript.Shell; " +
                "$shortcut = $shell.CreateShortcut('" + EscapePowerShell(linkPath) + "'); " +
                "$shortcut.TargetPath = '" + EscapePowerShell(targetPath) + "'; " +
                "$shortcut.Arguments = '" + EscapePowerShell(arguments) + "'; " +
                "$shortcut.WorkingDirectory = '" + EscapePowerShell(workingDirectory) + "'; " +
                "$shortcut.Description = '" + EscapePowerShell(description) + "'; " +
                "$shortcut.Save();";
            RunPowerShell(script);
        }

        private static string EscapePowerShell(string value)
        {
            return (value ?? string.Empty).Replace("'", "''");
        }

        private static void StartServiceOrFallback(string targetExe, string installDir)
        {
            if (IsAdministrator()) RunProcess("sc.exe", "start " + ServiceName, false);

            var info = new ProcessStartInfo
            {
                FileName = targetExe,
                Arguments = RunArg,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
                WorkingDirectory = installDir,
            };

            Process.Start(info);
            Console.WriteLine("Bridge agent process started.");
        }

        private static bool IsAdministrator()
        {
            try
            {
                var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
                var principal = new System.Security.Principal.WindowsPrincipal(identity);
                return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            }
            catch { return false; }
        }

        private static void PrintDiagnostics()
        {
            Console.WriteLine("Adisyum Printer Bridge Tanilama");
            Console.WriteLine("Version: " + BridgeVersion);
            Console.WriteLine("Local API: " + LocalApiPrefix);
            Console.WriteLine("DeviceId: " + EnsureDeviceId());
            Console.WriteLine("Device file: " + DeviceIdentityPath);
            Console.WriteLine("Printer cache: " + PrinterCachePath);
            Console.WriteLine("Log file: " + BridgeLogPath);
            Console.WriteLine("Diagnose script: " + DiagnoseScriptPath);
            Console.WriteLine("Spooler: " + GetSpoolerStatus());
            try
            {
                var printers = GetInstalledPrinters();
                Console.WriteLine("Printer count: " + printers.Count);
                foreach (var printer in printers.Take(20))
                {
                    Console.WriteLine("- " + printer.Name + " [" + printer.ConnectionType + "] " + (printer.Online ? "online" : "offline"));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Printer discovery error: " + ex.Message);
            }
        }

        private static void RunProcess(string fileName, string arguments, bool throwOnFailure)
        {
            try
            {
                var info = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                using (var process = Process.Start(info))
                {
                    process.WaitForExit(15000);
                    if (throwOnFailure && process.ExitCode != 0)
                        throw new InvalidOperationException(fileName + " failed with exit code " + process.ExitCode);
                }
            }
            catch
            {
                if (throwOnFailure) throw;
            }
        }

        private static void WaitForHealth()
        {
            var deadline = DateTime.UtcNow.AddSeconds(12);
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    var request = WebRequest.Create(LocalApiPrefix + "health");
                    request.Timeout = 1500;
                    using (var response = request.GetResponse())
                    {
                        Console.WriteLine("Bridge health OK.");
                        return;
                    }
                }
                catch
                {
                    System.Threading.Thread.Sleep(500);
                }
            }
            throw new TimeoutException("Bridge health endpoint did not answer: " + LocalApiPrefix + "health");
        }

        private static void RunAgent()
        {
            var listener = new HttpListener();
            listener.Prefixes.Add(LocalApiPrefix);
            try
            {
                listener.Start();
            }
            catch (Exception ex)
            {
                Log("Bridge listener failed to start: " + ex.Message);
                throw;
            }
            Log("Bridge agent listening on " + LocalApiPrefix);

            while (true)
            {
                HttpListenerContext context = null;
                try
                {
                    context = listener.GetContext();
                    HandleRequest(context);
                }
                catch (Exception ex)
                {
                    Log("Request failed: " + ex.Message);
                    if (context != null)
                    {
                        WriteJson(context.Response, new
                        {
                            ok = false,
                            status = "degraded",
                            error = ex.Message,
                            logPath = BridgeLogPath,
                        });
                    }
                }
                finally
                {
                    if (context != null)
                    {
                        context.Response.OutputStream.Close();
                    }
                }
            }
        }

        private static void SetCorsHeaders(HttpListenerResponse response, string origin)
        {
            response.Headers["Access-Control-Allow-Origin"]          = "*";
            response.Headers["Access-Control-Allow-Methods"]         = "GET, POST, OPTIONS";
            response.Headers["Access-Control-Allow-Headers"]         = "Content-Type, x-adisyum-device-id";
            response.Headers["Access-Control-Allow-Private-Network"] = "true";
        }

        private static void HandleRequest(HttpListenerContext context)
        {
            var request  = context.Request;
            var response = context.Response;
            var origin   = request.Headers["Origin"] ?? "*";

            SetCorsHeaders(response, origin);

            // ---------- CORS preflight ----------
            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 204;
                response.OutputStream.Close();
                return;
            }

            if (request.Url == null)
            {
                response.StatusCode = 400;
                WriteText(response, "Bad request", "text/plain; charset=utf-8");
                return;
            }

            var path = request.Url.AbsolutePath.Trim('/').ToLowerInvariant();

            // ---------- GET /health ----------
            if (request.HttpMethod == "GET" && path == "health")
            {
                var degraded = false;
                string error = null;
                List<PrinterInventoryItem> printers;
                try
                {
                    printers = GetInstalledPrinters();
                }
                catch (Exception ex)
                {
                    degraded = true;
                    error = ex.Message;
                    Log("Health printer discovery degraded: " + ex.Message);
                    printers = ReadPrinterCache();
                }
                var deviceId = EnsureDeviceId();
                var spoolerStatus = GetSpoolerStatus();
                var now = DateTimeOffset.UtcNow;
                WriteJson(response, new
                {
                    ok = !degraded,
                    status = degraded ? "degraded" : "healthy",
                    service = "adisyum-desktop-bridge",
                    deviceId = deviceId,
                    version = BridgeVersion,
                    localApi = LocalApiPrefix,
                    startedAt = now,
                    spooler = new { status = spoolerStatus },
                    installedPrinters = printers,
                    printers = printers,
                    printerCount = printers.Count,
                    printerCachePath = PrinterCachePath,
                    logPath = BridgeLogPath,
                    error = error,
                    administrator = IsAdministrator(),
                    agent = new
                    {
                        found = true,
                        online = true,
                        deviceId = deviceId,
                        agentVersion = BridgeVersion,
                        lastSeenAt = now,
                        printerCount = printers.Count,
                        spoolerStatus = spoolerStatus,
                    },
                });
                return;
            }

            // ---------- GET /diagnostics ----------
            if (request.HttpMethod == "GET" && path == "diagnostics")
            {
                var printers = GetInstalledPrinters();
                WriteJson(response, new
                {
                    ok = true,
                    service = "adisyum-desktop-bridge",
                    localApi = LocalApiPrefix,
                    deviceId = EnsureDeviceId(),
                    version = BridgeVersion,
                    printers = printers,
                    printerCount = printers.Count,
                    printerCachePath = PrinterCachePath,
                    logPath = BridgeLogPath,
                    administrator = IsAdministrator(),
                });
                return;
            }

            // ---------- GET /printers ----------
            if (request.HttpMethod == "GET" && path == "printers")
            {
                var degraded = false;
                string error = null;
                List<PrinterInventoryItem> printers;
                try
                {
                    printers = GetInstalledPrinters();
                }
                catch (Exception ex)
                {
                    degraded = true;
                    error = ex.Message;
                    Log("Printers endpoint degraded: " + ex.Message);
                    printers = ReadPrinterCache();
                }
                var deviceId = EnsureDeviceId();
                var spoolerStatus = GetSpoolerStatus();
                var now = DateTimeOffset.UtcNow;
                WriteJson(response, new
                {
                    ok = !degraded,
                    status = degraded ? "degraded" : "healthy",
                    service = "adisyum-desktop-bridge",
                    deviceId = deviceId,
                    version = BridgeVersion,
                    spooler = new { status = spoolerStatus },
                    installedPrinters = printers,
                    printers = printers,
                    printerCount = printers.Count,
                    logPath = BridgeLogPath,
                    error = error,
                    agent = new
                    {
                        found = true,
                        online = true,
                        deviceId = deviceId,
                        agentVersion = BridgeVersion,
                        lastSeenAt = now,
                        printerCount = printers.Count,
                        spoolerStatus = spoolerStatus,
                    },
                });
                return;
            }

            // ---------- POST /print ----------
            if (request.HttpMethod == "POST" && path == "print")
            {
                string body;
                using (var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8))
                {
                    body = reader.ReadToEnd();
                }

                PrintPayload payload;
                try
                {
                    payload = JsonSerializer.Deserialize<PrintPayload>(
                        body,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }
                catch
                {
                    response.StatusCode = 400;
                    WriteJson(response, new { error = "JSON parse hatası." });
                    return;
                }

                if (payload == null
                    || string.IsNullOrWhiteSpace(payload.PrinterName)
                    || string.IsNullOrWhiteSpace(payload.BytesBase64))
                {
                    response.StatusCode = 400;
                    WriteJson(response, new { error = "printerName ve bytesBase64 zorunlu." });
                    return;
                }

                byte[] rawBytes;
                try
                {
                    rawBytes = Convert.FromBase64String(payload.BytesBase64);
                }
                catch
                {
                    response.StatusCode = 400;
                    WriteJson(response, new { error = "Geçersiz bytesBase64 verisi." });
                    return;
                }

                if (rawBytes.Length == 0)
                {
                    response.StatusCode = 400;
                    WriteJson(response, new { error = "RAW buffer boş." });
                    return;
                }

                try
                {
                    int written = RawPrinter.SendRaw(payload.PrinterName, rawBytes);
                    WriteJson(response, new
                    {
                        success      = true,
                        printerName  = payload.PrinterName,
                        printed      = true,
                        mode         = "raw",
                        bytes        = written,
                        printJobs    = 1,
                        writeCalls   = 1
                    });
                }
                catch (Exception ex)
                {
                    response.StatusCode = 500;
                    WriteJson(response, new { error = ex.Message });
                }
                return;
            }

            response.StatusCode = 404;
            WriteText(response, "Not found", "text/plain; charset=utf-8");
        }

        private static List<PrinterInventoryItem> GetInstalledPrinters()
        {
            var discovered = new Dictionary<string, PrinterInventoryItem>(StringComparer.OrdinalIgnoreCase);
            var diagnostics = new List<object>();

            foreach (var method in GetDiscoveryMethods())
            {
                try
                {
                    var rows = ParseJsonRows(RunPowerShell(method.Script));
                    var accepted = 0;
                    foreach (var row in rows)
                    {
                        var printer = NormalizePrinter(row, method.Name);
                        if (printer == null) continue;
                        if (discovered.TryGetValue(printer.Name, out var existing))
                        {
                            discovered[printer.Name] = MergePrinter(existing, printer);
                        }
                        else
                        {
                            discovered[printer.Name] = printer;
                        }

                        accepted += 1;
                    }

                    diagnostics.Add(new { method = method.Name, ok = true, count = accepted });
                }
                catch (Exception ex)
                {
                    diagnostics.Add(new { method = method.Name, ok = false, error = ex.Message });
                    Console.Error.WriteLine("[adisyum-agent] printer discovery method failed: " + method.Name + " " + ex.Message);
                }
            }

            try
            {
                foreach (string name in PrinterSettings.InstalledPrinters)
                {
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    var fallback = new PrinterInventoryItem
                    {
                        Name = name.Trim(),
                        DriverName = string.Empty,
                        PortName = string.Empty,
                        Status = "Installed",
                        Shared = false,
                        Default = false,
                        WorkOffline = false,
                        Online = true,
                        ConnectionType = "local",
                        Escpos = IsEscPosCandidate(name, string.Empty),
                        Source = "PrinterSettings",
                        DiscoveredAt = DateTimeOffset.UtcNow,
                    };

                    if (discovered.TryGetValue(fallback.Name, out var existing))
                    {
                        discovered[fallback.Name] = MergePrinter(existing, fallback);
                    }
                    else
                    {
                        discovered[fallback.Name] = fallback;
                    }
                }
            }
            catch (Exception ex)
            {
                diagnostics.Add(new { method = "PrinterSettings", ok = false, error = ex.Message });
                Console.Error.WriteLine("[adisyum-agent] PrinterSettings fallback failed: " + ex.Message);
            }

            var printers = discovered.Values
                .OrderByDescending(item => item.Default)
                .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (printers.Count > 0)
            {
                Log("Printer discovery returned " + printers.Count + " printer(s).");
                WritePrinterCache(printers, diagnostics);
                return printers;
            }

            var cached = ReadPrinterCache();
            if (cached.Count > 0)
            {
                Log("Printer discovery empty; returning cached inventory with " + cached.Count + " printer(s).");
                return cached;
            }

            Log("Printer discovery returned no printers.");
            return printers;
        }

        private static IEnumerable<DiscoveryMethod> GetDiscoveryMethods()
        {
            return new[]
            {
                new DiscoveryMethod("Get-Printer", "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,Type | ConvertTo-Json -Depth 4"),
                new DiscoveryMethod("Win32_Printer", "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,WorkOffline,Default | ConvertTo-Json -Depth 4"),
                new DiscoveryMethod("WMI-Object", "Get-WmiObject Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,WorkOffline,Default | ConvertTo-Json -Depth 4"),
            };
        }

        private static string EnsureDeviceId()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(DeviceIdentityPath));
                if (File.Exists(DeviceIdentityPath))
                {
                    var current = File.ReadAllText(DeviceIdentityPath, Encoding.UTF8).Trim();
                    if (!string.IsNullOrWhiteSpace(current)) return current;
                }
                var next = "adisyum-bridge-" + Guid.NewGuid().ToString("N");
                File.WriteAllText(DeviceIdentityPath, next, Encoding.UTF8);
                return next;
            }
            catch
            {
                return "adisyum-bridge-" + Environment.MachineName.ToLowerInvariant();
            }
        }

        private static string GetSpoolerStatus()
        {
            try
            {
                var output = RunProcessWithOutput("sc.exe", "query Spooler", 5000);
                return output.IndexOf("RUNNING", StringComparison.OrdinalIgnoreCase) >= 0 ? "healthy" : "stopped";
            }
            catch
            {
                return "unknown";
            }
        }

        private static string RunPowerShell(string script)
        {
            var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            return RunProcessWithOutput("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded, 10000);
        }

        private static string RunProcessWithOutput(string fileName, string arguments, int timeoutMs)
        {
            using (var process = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            }))
            {
                if (process == null) throw new InvalidOperationException(fileName + " baslatilamadi.");
                var stdout = process.StandardOutput.ReadToEnd();
                var stderr = process.StandardError.ReadToEnd();
                if (!process.WaitForExit(timeoutMs))
                {
                    try { process.Kill(); } catch { }
                    throw new TimeoutException(fileName + " timeout.");
                }
                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? fileName + " failed." : stderr);
                }
                return stdout ?? string.Empty;
            }
        }

        private static IEnumerable<JsonElement> ParseJsonRows(string stdout)
        {
            if (string.IsNullOrWhiteSpace(stdout)) return Array.Empty<JsonElement>();
            using (var jsonDoc = JsonDocument.Parse(stdout))
            {
                var root = jsonDoc.RootElement.Clone();
                if (root.ValueKind == JsonValueKind.Array) return root.EnumerateArray().Select(item => item.Clone()).ToArray();
                if (root.ValueKind == JsonValueKind.Object) return new[] { root };
            }
            return Array.Empty<JsonElement>();
        }

        private static PrinterInventoryItem NormalizePrinter(JsonElement row, string source)
        {
            var name = ReadString(row, "Name");
            if (string.IsNullOrWhiteSpace(name)) return null;
            var driverName = ReadString(row, "DriverName");
            var portName = ReadString(row, "PortName");
            var status = ReadString(row, "PrinterStatus");
            var workOffline = ReadBool(row, "WorkOffline");

            return new PrinterInventoryItem
            {
                Name = name.Trim(),
                DriverName = driverName,
                PortName = portName,
                Status = string.IsNullOrWhiteSpace(status) ? "Ready" : status,
                Shared = ReadBool(row, "Shared"),
                Default = ReadBool(row, "Default"),
                WorkOffline = workOffline,
                Online = !workOffline && status != "7" && !status.Equals("Offline", StringComparison.OrdinalIgnoreCase),
                ConnectionType = InferConnectionType(portName, name),
                Escpos = IsEscPosCandidate(name, driverName),
                Source = source,
                DiscoveredAt = DateTimeOffset.UtcNow,
            };
        }

        private static PrinterInventoryItem MergePrinter(PrinterInventoryItem existing, PrinterInventoryItem next)
        {
            return new PrinterInventoryItem
            {
                Name = existing.Name,
                DriverName = string.IsNullOrWhiteSpace(existing.DriverName) ? next.DriverName : existing.DriverName,
                PortName = string.IsNullOrWhiteSpace(existing.PortName) ? next.PortName : existing.PortName,
                Status = string.IsNullOrWhiteSpace(existing.Status) ? next.Status : existing.Status,
                Shared = existing.Shared || next.Shared,
                Default = existing.Default || next.Default,
                WorkOffline = existing.WorkOffline && next.WorkOffline,
                Online = existing.Online || next.Online,
                ConnectionType = existing.ConnectionType == "local" ? next.ConnectionType : existing.ConnectionType,
                Escpos = existing.Escpos || next.Escpos,
                Source = existing.Source + "," + next.Source,
                DiscoveredAt = DateTimeOffset.UtcNow,
            };
        }

        private static string ReadString(JsonElement row, string propertyName)
        {
            if (!row.TryGetProperty(propertyName, out var value)) return string.Empty;
            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : value.ToString();
        }

        private static bool ReadBool(JsonElement row, string propertyName)
        {
            if (!row.TryGetProperty(propertyName, out var value)) return false;
            if (value.ValueKind == JsonValueKind.True) return true;
            if (value.ValueKind == JsonValueKind.False) return false;
            return bool.TryParse(value.ToString(), out var parsed) && parsed;
        }

        private static string InferConnectionType(string portName, string printerName)
        {
            var normalized = ((portName ?? string.Empty) + " " + (printerName ?? string.Empty)).ToLowerInvariant();
            if (normalized.Contains("usb") || normalized.Contains("dot4")) return "usb";
            if (normalized.Contains("ip_") || normalized.Contains("tcp") || normalized.Contains("9100")) return "network";
            if (normalized.StartsWith("\\\\")) return "shared";
            if (normalized.Contains("nul") || normalized.Contains("file:")) return "virtual";
            return "local";
        }

        private static bool IsEscPosCandidate(string name, string driverName)
        {
            var normalized = ((name ?? string.Empty) + " " + (driverName ?? string.Empty)).ToLowerInvariant();
            var tokens = new[] { "thermal", "receipt", "pos", "esc", "epson", "xprinter", "bixolon", "star", "citizen", "rongta", "sunmi" };
            return tokens.Any(token => normalized.Contains(token));
        }

        private static List<PrinterInventoryItem> ReadPrinterCache()
        {
            try
            {
                if (!File.Exists(PrinterCachePath)) return new List<PrinterInventoryItem>();
                var cache = JsonSerializer.Deserialize<PrinterInventoryCache>(File.ReadAllText(PrinterCachePath));
                return cache?.Printers ?? new List<PrinterInventoryItem>();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[adisyum-agent] printer cache read failed: " + ex.Message);
                return new List<PrinterInventoryItem>();
            }
        }

        private static void WritePrinterCache(List<PrinterInventoryItem> printers, List<object> diagnostics)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(PrinterCachePath));
                var cache = new PrinterInventoryCache
                {
                    SavedAt = DateTimeOffset.UtcNow,
                    Printers = printers,
                    Diagnostics = diagnostics,
                };
                File.WriteAllText(PrinterCachePath, JsonSerializer.Serialize(cache));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[adisyum-agent] printer cache write failed: " + ex.Message);
            }
        }

        private static void WriteJson(HttpListenerResponse response, object payload)
        {
            response.StatusCode = 200;
            var json = JsonSerializer.Serialize(payload);
            WriteText(response, json, "application/json; charset=utf-8");
        }

        private static void WriteText(HttpListenerResponse response, string content, string contentType)
        {
            var bytes = Encoding.UTF8.GetBytes(content ?? string.Empty);
            response.ContentType = contentType;
            response.ContentEncoding = Encoding.UTF8;
            response.ContentLength64 = bytes.Length;
            response.OutputStream.Write(bytes, 0, bytes.Length);
        }

        private static void Log(string message)
        {
            var line = DateTimeOffset.Now.ToString("O") + " " + message;
            try
            {
                Console.WriteLine(line);
            }
            catch { }

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(BridgeLogPath));
                File.AppendAllText(BridgeLogPath, line + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }

        private sealed class PrintPayload
        {
            public string PrinterName { get; set; }
            public string BytesBase64 { get; set; }
            public string Source      { get; set; }
            public string Mode        { get; set; }
        }

        private sealed class DiscoveryMethod
        {
            public DiscoveryMethod(string name, string script)
            {
                Name = name;
                Script = script;
            }

            public string Name { get; }
            public string Script { get; }
        }

        private sealed class PrinterInventoryItem
        {
            public string Name { get; set; }
            public string DriverName { get; set; }
            public string PortName { get; set; }
            public string Status { get; set; }
            public bool Shared { get; set; }
            public bool Default { get; set; }
            public bool WorkOffline { get; set; }
            public bool Online { get; set; }
            public string ConnectionType { get; set; }
            public bool Escpos { get; set; }
            public string Source { get; set; }
            public DateTimeOffset DiscoveredAt { get; set; }
        }

        private sealed class PrinterInventoryCache
        {
            public DateTimeOffset SavedAt { get; set; }
            public List<PrinterInventoryItem> Printers { get; set; }
            public List<object> Diagnostics { get; set; }
        }
    }
}
