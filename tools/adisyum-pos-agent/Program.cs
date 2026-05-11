using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace AdisyumPosAgent
{
    internal static class Program
    {
        private const int HttpPort = 3001;
        private const int HttpsPort = 3443;
        private const string AppName = "AdisyumPosAgent";

        [STAThread]
        private static async Task Main()
        {
            TryEnableAutostart();

            using var httpServer = BuildServer(new[]
            {
                $"http://127.0.0.1:{HttpPort}/",
                $"http://localhost:{HttpPort}/",
            });

            HttpListener httpsServer = null;
            try
            {
                httpsServer = BuildServer(new[]
                {
                    $"https://127.0.0.1:{HttpsPort}/",
                    $"https://localhost:{HttpsPort}/",
                });
            }
            catch
            {
                httpsServer = null;
            }

            var tasks = new List<Task>
            {
                RunServerLoop(httpServer),
            };

            if (httpsServer != null)
            {
                tasks.Add(RunServerLoop(httpsServer));
            }

            await Task.WhenAll(tasks);
        }

        private static HttpListener BuildServer(IEnumerable<string> prefixes)
        {
            var listener = new HttpListener();
            foreach (var prefix in prefixes)
            {
                listener.Prefixes.Add(prefix);
            }

            listener.Start();
            return listener;
        }

        private static async Task RunServerLoop(HttpListener listener)
        {
            while (true)
            {
                HttpListenerContext context = null;
                try
                {
                    context = await listener.GetContextAsync().ConfigureAwait(false);
                    _ = Task.Run(() => HandleRequest(context));
                }
                catch
                {
                    if (!listener.IsListening) break;
                    if (context != null)
                    {
                        try { context.Response.StatusCode = 500; context.Response.Close(); } catch { }
                    }
                }
            }
        }

        private static void HandleRequest(HttpListenerContext context)
        {
            try
            {
                AddCors(context.Response);

                if (context.Request.HttpMethod == "OPTIONS")
                {
                    context.Response.StatusCode = 204;
                    context.Response.Close();
                    return;
                }

                var path = context.Request.Url.AbsolutePath?.TrimEnd('/').ToLowerInvariant() ?? string.Empty;

                if (context.Request.HttpMethod == "GET" && (path == "/printers" || path == string.Empty))
                {
                    var printers = GetPrinters();
                    WriteJson(context.Response, printers);
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/health")
                {
                    WriteJson(context.Response, new { ok = true, service = AppName, time = DateTimeOffset.UtcNow });
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/print")
                {
                    using var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding ?? Encoding.UTF8);
                    var bodyText = reader.ReadToEnd();
                    var payload = JsonSerializer.Deserialize<PrintPayload>(bodyText);

                    if (payload == null || string.IsNullOrWhiteSpace(payload.printerName) || string.IsNullOrWhiteSpace(payload.text))
                    {
                        context.Response.StatusCode = 400;
                        WriteJson(context.Response, new { error = "printerName ve text zorunlu." });
                        return;
                    }

                    PrintText(payload.printerName.Trim(), payload.text);
                    WriteJson(context.Response, new { success = true, printerName = payload.printerName, queued = true });
                    return;
                }

                context.Response.StatusCode = 404;
                WriteJson(context.Response, new { error = "Not found" });
            }
            catch (Exception ex)
            {
                try
                {
                    context.Response.StatusCode = 500;
                    WriteJson(context.Response, new { error = ex.Message });
                }
                catch
                {
                    // ignore
                }
            }
        }

        private static void AddCors(HttpListenerResponse response)
        {
            response.Headers["Access-Control-Allow-Origin"] = "*";
            response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
            response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
            response.ContentType = "application/json; charset=utf-8";
        }

        private static void WriteJson(HttpListenerResponse response, object payload)
        {
            var json = JsonSerializer.Serialize(payload);
            var bytes = Encoding.UTF8.GetBytes(json);
            response.ContentLength64 = bytes.Length;
            response.OutputStream.Write(bytes, 0, bytes.Length);
            response.OutputStream.Flush();
            response.Close();
        }

        private static string[] GetPrinters()
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "powershell",
                Arguments = "-Command \"Get-Printer | Select-Object Name | ConvertTo-Json\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(startInfo);
            var stdout = process?.StandardOutput.ReadToEnd() ?? string.Empty;
            process?.WaitForExit(8000);

            if (string.IsNullOrWhiteSpace(stdout))
            {
                return Array.Empty<string>();
            }

            using var jsonDoc = JsonDocument.Parse(stdout);
            var root = jsonDoc.RootElement;

            if (root.ValueKind == JsonValueKind.Array)
            {
                return root
                    .EnumerateArray()
                    .Select(item => item.TryGetProperty("Name", out var nameProp) ? nameProp.GetString() : null)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .ToArray();
            }

            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("Name", out var single))
            {
                var value = single.GetString();
                return string.IsNullOrWhiteSpace(value) ? Array.Empty<string>() : new[] { value };
            }

            return Array.Empty<string>();
        }

        private static void PrintText(string printerName, string text)
        {
            var escapedPrinter = printerName.Replace("'", "''");
            var escapedText = text.Replace("'", "''");
            var command = "$content = '" + escapedText + "'; $content | Out-Printer -Name '" + escapedPrinter + "'";

            var startInfo = new ProcessStartInfo
            {
                FileName = "powershell",
                Arguments = "-Command \"" + command + "\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = Process.Start(startInfo);
            process?.WaitForExit(8000);

            if (process == null || process.ExitCode != 0)
            {
                var error = process?.StandardError.ReadToEnd();
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(error) ? "Yazdırma başarısız." : error);
            }
        }

        private static void TryEnableAutostart()
        {
            try
            {
                var exePath = Process.GetCurrentProcess().MainModule?.FileName;
                if (string.IsNullOrWhiteSpace(exePath)) return;

                var regCommand = "reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "
                    + AppName
                    + " /t REG_SZ /d \""
                    + exePath
                    + "\" /f";

                var startInfo = new ProcessStartInfo
                {
                    FileName = "cmd",
                    Arguments = "/c " + regCommand,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                using var process = Process.Start(startInfo);
                process?.WaitForExit(2000);
            }
            catch
            {
                // ignore
            }
        }

        private class PrintPayload
        {
            public string printerName { get; set; }
            public string text { get; set; }
        }
    }
}
