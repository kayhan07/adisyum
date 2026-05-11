using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace AdisyumPosAgentInstaller
{
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

        private static void HandleRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            if (request.Url == null)
            {
                response.StatusCode = 400;
                WriteText(response, "Bad request", "text/plain; charset=utf-8");
                return;
            }

            var path = request.Url.AbsolutePath.Trim('/').ToLowerInvariant();

            if (request.HttpMethod == "GET" && path == "printers")
            {
                var printers = GetInstalledPrinters();
                WriteJson(response, printers);
                return;
            }

            if (request.HttpMethod == "POST" && path == "print")
            {
                using (var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8))
                {
                    var body = reader.ReadToEnd();
                    var payload = JsonSerializer.Deserialize<PrintPayload>(body, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    if (payload == null || string.IsNullOrWhiteSpace(payload.PrinterName) || string.IsNullOrWhiteSpace(payload.Text))
                    {
                        response.StatusCode = 400;
                        WriteJson(response, new { error = "printerName ve text zorunlu." });
                        return;
                    }

                    WriteJson(response, new { success = true, printerName = payload.PrinterName, queued = true });
                    return;
                }
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
            public string Text { get; set; }
        }
    }
}
