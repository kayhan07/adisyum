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
        private const string ListenPrefix = "http://127.0.0.1:3001/";
        private const string LocalApiPrefix = "http://127.0.0.1:4891/";
        private const string RunArg = "--run-agent";
        private const string ServiceName = "AdisyumDesktopBridge";
        private const string TaskName = "AdisyumDesktopBridge";
        private static readonly string PrinterCachePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Adisyum",
            "DesktopBridge",
            "printer-cache.json");

        private static int Main(string[] args)
        {
            if (args != null)
            {
                foreach (var arg in args)
                {
                    if (string.Equals(arg, RunArg, StringComparison.OrdinalIgnoreCase))
                    {
                        RunAgent();
                        return 0;
                    }
                }
            }

            try
            {
                InstallAndStartAgent();
                Console.WriteLine("Adisyum POS Agent kuruldu ve başlatıldı.");
                Console.WriteLine("Sayfayı yenileyip agent durumunu kontrol edebilirsiniz.");
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Kurulum hatası: " + ex.Message);
                return 1;
            }
        }

        private static void InstallAndStartAgent()
        {
            var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            var installDir = Path.Combine(programData, "Adisyum", "DesktopBridge");
            Directory.CreateDirectory(installDir);

            var currentExe = Process.GetCurrentProcess().MainModule.FileName;
            var targetExe = Path.Combine(installDir, "AdisyumDesktopBridge.exe");

            if (!string.Equals(currentExe, targetExe, StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(currentExe, targetExe, true);
            }

            RegisterWindowsService(targetExe);
            RegisterStartupTask(targetExe);

            using (var runKey = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", true))
            {
                if (runKey == null)
                {
                    throw new InvalidOperationException("Windows Run registry key açılamadı.");
                }

                runKey.SetValue("AdisyumPosAgent", "\"" + targetExe + "\" " + RunArg, RegistryValueKind.String);
            }

            StartServiceOrFallback(targetExe, installDir);
            WaitForHealth();
        }

        private static void RegisterWindowsService(string targetExe)
        {
            if (!IsAdministrator()) return;

            RunProcess("sc.exe", "stop " + ServiceName, false);
            RunProcess("sc.exe", "delete " + ServiceName, false);
            RunProcess("sc.exe", "create " + ServiceName + " binPath= \"" + targetExe + " " + RunArg + "\" start= auto DisplayName= \"Adisyum Desktop Bridge\"", true);
            RunProcess("sc.exe", "description " + ServiceName + " \"Adisyum local printer, fiscal POS and offline queue bridge\"", false);
            RunProcess("sc.exe", "failure " + ServiceName + " reset= 60 actions= restart/5000/restart/10000/restart/30000", false);
        }

        private static void RegisterStartupTask(string targetExe)
        {
            var args = "/Create /TN \"" + TaskName + "\" /TR \"\\\"" + targetExe + "\\\" " + RunArg + "\" /SC ONLOGON /RL HIGHEST /F";
            RunProcess("schtasks.exe", args, false);
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
                    using (var response = request.GetResponse()) { return; }
                }
                catch
                {
                    System.Threading.Thread.Sleep(500);
                }
            }
        }

        private static void RunAgent()
        {
            var listener = new HttpListener();
            listener.Prefixes.Add(ListenPrefix);
            listener.Prefixes.Add(LocalApiPrefix);
            listener.Start();

            while (true)
            {
                var context = listener.GetContext();
                try
                {
                    HandleRequest(context);
                }
                catch
                {
                    context.Response.StatusCode = 500;
                    WriteText(context.Response, "Internal server error", "text/plain; charset=utf-8");
                }
                finally
                {
                    context.Response.OutputStream.Close();
                }
            }
        }

        private static void SetCorsHeaders(HttpListenerResponse response, string origin)
        {
            response.Headers["Access-Control-Allow-Origin"]          = string.IsNullOrEmpty(origin) ? "*" : origin;
            response.Headers["Access-Control-Allow-Methods"]         = "GET, POST, OPTIONS";
            response.Headers["Access-Control-Allow-Headers"]         = "Content-Type, Authorization";
            response.Headers["Access-Control-Allow-Credentials"]     = "true";
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

            // ---------- GET /printers ----------
            if (request.HttpMethod == "GET" && path == "printers")
            {
                var printers = GetInstalledPrinters();
                WriteJson(response, printers);
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
                WritePrinterCache(printers, diagnostics);
                return printers;
            }

            var cached = ReadPrinterCache();
            if (cached.Count > 0)
            {
                Console.Error.WriteLine("[adisyum-agent] printer discovery empty; returning cached inventory.");
                return cached;
            }

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
