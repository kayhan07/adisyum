using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing.Printing;
using System.IO;
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
        private const string RunArg = "--run-agent";

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
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var installDir = Path.Combine(localAppData, "AdisyumPosAgent");
            Directory.CreateDirectory(installDir);

            var currentExe = Process.GetCurrentProcess().MainModule.FileName;
            var targetExe = Path.Combine(installDir, "adisyum-pos-agent.exe");

            if (!string.Equals(currentExe, targetExe, StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(currentExe, targetExe, true);
            }

            using (var runKey = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", true))
            {
                if (runKey == null)
                {
                    throw new InvalidOperationException("Windows Run registry key açılamadı.");
                }

                runKey.SetValue("AdisyumPosAgent", "\"" + targetExe + "\" " + RunArg, RegistryValueKind.String);
            }

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

        private static void RunAgent()
        {
            var listener = new HttpListener();
            listener.Prefixes.Add(ListenPrefix);
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

        private static List<string> GetInstalledPrinters()
        {
            var printers = new List<string>();
            foreach (string printer in PrinterSettings.InstalledPrinters)
            {
                if (!string.IsNullOrWhiteSpace(printer))
                {
                    printers.Add(printer);
                }
            }

            return printers;
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
    }
}
