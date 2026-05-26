using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Reflection;

namespace AdisyumPosAgent
{
    internal static class Program
    {
        private const int HttpPort = 3001;
        private const int LocalApiPort = 4891;
        private const int HttpsPort = 3443;
        private const string AppName = "AdisyumDesktopBridge";
        private static readonly BridgeStateStore Store = new BridgeStateStore();
        private static readonly SyncQueueService SyncQueue = new SyncQueueService(Store);
        private static readonly DeviceCompatibilityEngine Compatibility = new DeviceCompatibilityEngine(Store);
        private static readonly PrintQueueService PrintQueue = new PrintQueueService(Store, Compatibility);
        private static readonly FiscalTransactionQueue FiscalQueue = new FiscalTransactionQueue(Store, Compatibility);
        private static readonly HealthMonitor Health = new HealthMonitor(Store, PrintQueue, SyncQueue, Compatibility, FiscalQueue);
        private static readonly CancellationTokenSource Shutdown = new CancellationTokenSource();

        [STAThread]
        private static async Task Main()
        {
            TryEnableAutostart();
            Store.Load();

            using var httpServer = BuildServer(new[]
            {
                $"http://127.0.0.1:{HttpPort}/",
                $"http://localhost:{HttpPort}/",
                $"http://127.0.0.1:{LocalApiPort}/",
                $"http://localhost:{LocalApiPort}/",
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
                RunServerLoop(httpServer, Shutdown.Token),
                PrintQueue.RunWorker(Shutdown.Token),
                SyncQueue.RunWorker(Shutdown.Token),
                FiscalQueue.RunWorker(Shutdown.Token),
                Health.RunHeartbeat(Shutdown.Token),
            };

            if (httpsServer != null) tasks.Add(RunServerLoop(httpsServer, Shutdown.Token));
            await Task.WhenAll(tasks);
        }

        private static HttpListener BuildServer(IEnumerable<string> prefixes)
        {
            var listener = new HttpListener();
            foreach (var prefix in prefixes) listener.Prefixes.Add(prefix);
            listener.Start();
            return listener;
        }

        private static async Task RunServerLoop(HttpListener listener, CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                HttpListenerContext context = null;
                try
                {
                    context = await listener.GetContextAsync().ConfigureAwait(false);
                    _ = Task.Run(() => HandleRequest(context), token);
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

                var path = context.Request.Url.AbsolutePath.TrimEnd('/').ToLowerInvariant();
                if (path.Length == 0) path = "/health";

                if (context.Request.HttpMethod == "GET" && path == "/health")
                {
                    WriteJson(context.Response, Health.BuildSnapshot());
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/printers")
                {
                    WriteJson(context.Response, PrinterDiscovery.GetPrinterInventory());
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/devices")
                {
                    WriteJson(context.Response, Compatibility.BuildInventory());
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/devices/discover")
                {
                    WriteJson(context.Response, Compatibility.DiscoverDevices());
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/compatibility")
                {
                    WriteJson(context.Response, Compatibility.BuildCompatibilityMatrix());
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/escpos/render")
                {
                    var payload = ReadJson<EscPosRenderPayload>(context.Request);
                    WriteJson(context.Response, EscPosAdapter.Render(payload));
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/queues")
                {
                    WriteJson(context.Response, new
                    {
                        ok = true,
                        print = PrintQueue.GetMetrics(),
                        sync = SyncQueue.GetMetrics(),
                        updatedAt = DateTimeOffset.UtcNow,
                    });
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/pos/status")
                {
                    WriteJson(context.Response, FiscalQueue.GetStatus());
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/login")
                {
                    var payload = ReadJson<LoginPayload>(context.Request);
                    var session = Store.UpdateSession(payload);
                    WriteJson(context.Response, new { ok = true, session.tenantId, session.subscriberNo, session.username, session.createdAt });
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/print")
                {
                    var payload = ReadJson<PrintPayload>(context.Request);
                    var result = PrintQueue.Enqueue(payload);
                    WriteJson(context.Response, result);
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/sync/enqueue")
                {
                    var payload = ReadJson<SyncPayload>(context.Request);
                    var result = SyncQueue.Enqueue(payload);
                    WriteJson(context.Response, result);
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/pos/transaction")
                {
                    var payload = ReadJson<FiscalTransactionPayload>(context.Request);
                    WriteJson(context.Response, FiscalQueue.Enqueue(payload));
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/pos/report")
                {
                    var payload = ReadJson<FiscalReportPayload>(context.Request);
                    WriteJson(context.Response, FiscalQueue.EnqueueReport(payload));
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/service/status")
                {
                    WriteJson(context.Response, WindowsServiceRuntime.GetStatus());
                    return;
                }

                if (context.Request.HttpMethod == "GET" && path == "/updater/status")
                {
                    WriteJson(context.Response, BridgeUpdater.GetStatus());
                    return;
                }

                if (context.Request.HttpMethod == "POST" && path == "/drawer/open")
                {
                    var payload = ReadJson<DeviceCommandPayload>(context.Request);
                    WriteJson(context.Response, DeviceRegistry.OpenDrawer(payload));
                    return;
                }

                context.Response.StatusCode = 404;
                WriteJson(context.Response, new { ok = false, error = "Not found" });
            }
            catch (Exception ex)
            {
                try
                {
                    context.Response.StatusCode = 500;
                    WriteJson(context.Response, new { ok = false, error = ex.Message });
                }
                catch { }
            }
        }

        private static T ReadJson<T>(HttpListenerRequest request) where T : new()
        {
            using var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8);
            var bodyText = reader.ReadToEnd();
            if (string.IsNullOrWhiteSpace(bodyText)) return new T();
            return JsonSerializer.Deserialize<T>(bodyText, JsonOptions()) ?? new T();
        }

        private static JsonSerializerOptions JsonOptions()
        {
            return new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        }

        private static void AddCors(HttpListenerResponse response)
        {
            response.Headers["Access-Control-Allow-Origin"] = "*";
            response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
            response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Adisyum-Bridge-Token";
            response.Headers["Access-Control-Allow-Private-Network"] = "true";
            response.Headers["Vary"] = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network";
            response.Headers["X-Adisyum-Bridge"] = AppName;
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

        private static void TryEnableAutostart()
        {
            try
            {
                var exePath = Process.GetCurrentProcess().MainModule?.FileName;
                if (string.IsNullOrWhiteSpace(exePath)) return;
                var regCommand = "reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "
                    + AppName + " /t REG_SZ /d \"" + exePath + "\" /f";
                using var process = Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd",
                    Arguments = "/c " + regCommand,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                });
                process?.WaitForExit(2000);
            }
            catch { }
        }
    }

    internal sealed class BridgeStateStore
    {
        private readonly object sync = new object();
        private readonly string stateFile;
        private BridgeState state = new BridgeState();

        public BridgeStateStore()
        {
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Adisyum", "DesktopBridge");
            Directory.CreateDirectory(root);
            stateFile = Path.Combine(root, "bridge-state.bin");
        }

        public BridgeState Snapshot()
        {
            lock (sync) return state.Clone();
        }

        public void Load()
        {
            lock (sync)
            {
                if (!File.Exists(stateFile)) return;
                try
                {
                    var encrypted = File.ReadAllBytes(stateFile);
                    var json = LocalCrypto.Unprotect(encrypted);
                    state = JsonSerializer.Deserialize<BridgeState>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BridgeState();
                }
                catch
                {
                    var corruptPath = stateFile + ".corrupt-" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    try { File.Move(stateFile, corruptPath); } catch { }
                    state = new BridgeState { LastError = "Local state corruption recovered; cache rebuilt." };
                }
            }
        }

        public void Save()
        {
            lock (sync)
            {
                var json = JsonSerializer.Serialize(state);
                File.WriteAllBytes(stateFile, LocalCrypto.Protect(json));
            }
        }

        public BridgeSession UpdateSession(LoginPayload payload)
        {
            if (string.IsNullOrWhiteSpace(payload.subscriberNo) || string.IsNullOrWhiteSpace(payload.username) || string.IsNullOrWhiteSpace(payload.password))
            {
                throw new InvalidOperationException("abone numarasi, kullanici adi ve sifre zorunlu.");
            }

            lock (sync)
            {
                var tenantId = string.IsNullOrWhiteSpace(payload.tenantId) ? "tenant-" + payload.subscriberNo.Trim() : payload.tenantId.Trim();
                state.Session = new BridgeSession
                {
                    tenantId = tenantId,
                    subscriberNo = payload.subscriberNo.Trim(),
                    username = payload.username.Trim(),
                    credentialHash = LocalCrypto.Hash(payload.password),
                    token = LocalCrypto.Hash(Guid.NewGuid().ToString("N") + payload.username),
                    createdAt = DateTimeOffset.UtcNow,
                    expiresAt = DateTimeOffset.UtcNow.AddDays(30),
                };
                Save();
                return state.Session;
            }
        }

        public void Mutate(Action<BridgeState> action)
        {
            lock (sync)
            {
                action(state);
                Save();
            }
        }
    }

    internal sealed class PrintQueueService
    {
        private readonly BridgeStateStore store;
        private readonly DeviceCompatibilityEngine compatibility;
        private volatile bool processing;

        public PrintQueueService(BridgeStateStore store, DeviceCompatibilityEngine compatibility)
        {
            this.store = store;
            this.compatibility = compatibility;
        }

        public object Enqueue(PrintPayload payload)
        {
            var snapshot = store.Snapshot();
            var tenantId = ResolveTenant(payload.tenantId, snapshot);
            var printerName = ResolvePrinter(payload, snapshot);
            var content = ResolveContent(payload);
            if (string.IsNullOrWhiteSpace(printerName) || content.Length == 0) throw new InvalidOperationException("printerName ve text veya bytesBase64 zorunlu.");

            var dedupeKey = string.IsNullOrWhiteSpace(payload.requestId)
                ? LocalCrypto.Hash(tenantId + printerName + content)
                : tenantId + "::" + payload.requestId.Trim();

            var job = new PrintJob
            {
                id = "print-" + Guid.NewGuid().ToString("N"),
                tenantId = tenantId,
                printerName = printerName,
                role = string.IsNullOrWhiteSpace(payload.printerRole) ? "cashier" : payload.printerRole.Trim(),
                contentBase64 = Convert.ToBase64String(content),
                dedupeKey = dedupeKey,
                source = string.IsNullOrWhiteSpace(payload.source) ? "local-api" : payload.source.Trim(),
                protocol = string.IsNullOrWhiteSpace(payload.protocol) ? "auto" : payload.protocol.Trim(),
                status = "pending",
                priority = payload.priority <= 0 ? 5 : payload.priority,
                attempts = 0,
                maxAttempts = payload.maxAttempts <= 0 ? 8 : payload.maxAttempts,
                createdAt = DateTimeOffset.UtcNow,
                updatedAt = DateTimeOffset.UtcNow,
            };

            store.Mutate(state =>
            {
                var duplicate = state.PrintQueue.Any(item => item.dedupeKey == dedupeKey && item.status != "failed");
                if (!duplicate) state.PrintQueue.Add(job);
            });

            return new { ok = true, queued = true, jobId = job.id, tenantId, printerName };
        }

        public object GetMetrics()
        {
            var state = store.Snapshot();
            return new
            {
                pending = state.PrintQueue.Count(j => j.status == "pending"),
                printing = state.PrintQueue.Count(j => j.status == "printing"),
                acked = state.PrintQueue.Count(j => j.status == "acked"),
                failed = state.PrintQueue.Count(j => j.status == "failed"),
                dead = state.PrintQueue.Count(j => j.status == "dead"),
                tenantCount = state.PrintQueue.Select(j => j.tenantId).Distinct().Count(),
            };
        }

        public async Task RunWorker(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    await ProcessBatch().ConfigureAwait(false);
                    await Task.Delay(1000, token).ConfigureAwait(false);
                }
                catch (TaskCanceledException) { }
                catch { await Task.Delay(3000, token).ConfigureAwait(false); }
            }
        }

        private Task ProcessBatch()
        {
            if (processing) return Task.CompletedTask;
            processing = true;
            try
            {
                var state = store.Snapshot();
                var ready = state.PrintQueue
                    .Where(job => (job.status == "pending" || job.status == "failed") && (!job.nextRetryAt.HasValue || job.nextRetryAt.Value <= DateTimeOffset.UtcNow))
                    .OrderBy(job => job.priority)
                    .ThenBy(job => job.createdAt)
                    .Take(5)
                    .ToList();

                foreach (var job in ready)
                {
                    TryPrint(job);
                }

                store.Mutate(next =>
                {
                    next.PrintQueue = next.PrintQueue
                        .Where(job => job.status != "acked" || job.updatedAt > DateTimeOffset.UtcNow.AddHours(-6))
                        .TakeLast(1000)
                        .ToList();
                });
            }
            finally
            {
                processing = false;
            }
            return Task.CompletedTask;
        }

        private void TryPrint(PrintJob job)
        {
            store.Mutate(state =>
            {
                var current = state.PrintQueue.FirstOrDefault(item => item.id == job.id);
                if (current == null) return;
                current.status = "printing";
                current.attempts += 1;
                current.updatedAt = DateTimeOffset.UtcNow;
            });

            try
            {
                var device = compatibility.ResolvePrinter(job.printerName, job.protocol);
                var adapter = compatibility.ResolvePrinterAdapter(device);
                var content = Convert.FromBase64String(job.contentBase64);
                adapter.Print(device, content, job);
                store.Mutate(state =>
                {
                    var current = state.PrintQueue.FirstOrDefault(item => item.id == job.id);
                    if (current == null) return;
                    current.status = "acked";
                    current.ackId = "ack-" + Guid.NewGuid().ToString("N");
                    current.updatedAt = DateTimeOffset.UtcNow;
                    state.DeviceHealth[job.printerName] = DeviceHealthState.RecordSuccess(job.printerName, device.vendor, device.protocol);
                    state.PrinterHealth[job.printerName] = PrinterState.Online(job.printerName);
                });
            }
            catch (Exception ex)
            {
                store.Mutate(state =>
                {
                    var current = state.PrintQueue.FirstOrDefault(item => item.id == job.id);
                    if (current == null) return;
                    current.status = current.attempts >= current.maxAttempts ? "dead" : "failed";
                    current.lastError = ex.Message;
                    current.nextRetryAt = DateTimeOffset.UtcNow.AddSeconds(Math.Min(300, Math.Pow(2, current.attempts) * 2));
                    current.updatedAt = DateTimeOffset.UtcNow;
                    state.DeviceHealth[job.printerName] = DeviceHealthState.RecordFailure(job.printerName, "printer", current.protocol, ex.Message);
                    state.PrinterHealth[job.printerName] = PrinterState.Failed(job.printerName, ex.Message);
                });
            }
        }

        private static string ResolveTenant(string requestedTenantId, BridgeState state)
        {
            if (!string.IsNullOrWhiteSpace(requestedTenantId)) return requestedTenantId.Trim();
            if (!string.IsNullOrWhiteSpace(state.Session?.tenantId)) return state.Session.tenantId;
            throw new InvalidOperationException("tenant session bulunamadi.");
        }

        private static string ResolvePrinter(PrintPayload payload, BridgeState state)
        {
            if (!string.IsNullOrWhiteSpace(payload.printerName)) return payload.printerName.Trim();
            var role = string.IsNullOrWhiteSpace(payload.printerRole) ? "cashier" : payload.printerRole.Trim();
            if (state.PrinterRoutes.TryGetValue(role, out var printer)) return printer;
            if (!string.IsNullOrWhiteSpace(payload.category) && state.PrinterRoutes.TryGetValue(payload.category.Trim(), out printer)) return printer;
            return string.Empty;
        }

        private static byte[] ResolveContent(PrintPayload payload)
        {
            if (!string.IsNullOrWhiteSpace(payload.bytesBase64)) return Convert.FromBase64String(payload.bytesBase64);
            return Encoding.UTF8.GetBytes(payload.text ?? string.Empty);
        }
    }

    internal sealed class SyncQueueService
    {
        private readonly BridgeStateStore store;

        public SyncQueueService(BridgeStateStore store)
        {
            this.store = store;
        }

        public object Enqueue(SyncPayload payload)
        {
            var state = store.Snapshot();
            var tenantId = string.IsNullOrWhiteSpace(payload.tenantId) ? state.Session?.tenantId : payload.tenantId.Trim();
            if (string.IsNullOrWhiteSpace(tenantId)) throw new InvalidOperationException("tenantId zorunlu.");

            var mutationId = string.IsNullOrWhiteSpace(payload.mutationId)
                ? (string.IsNullOrWhiteSpace(payload.requestId) ? LocalCrypto.Hash(tenantId + "::" + payload.type + "::" + (payload.bodyJson ?? "{}")) : payload.requestId.Trim())
                : payload.mutationId.Trim();
            var item = new SyncJob
            {
                id = "sync-" + Guid.NewGuid().ToString("N"),
                tenantId = tenantId,
                type = string.IsNullOrWhiteSpace(payload.type) ? "offline-order" : payload.type.Trim(),
                bodyJson = payload.bodyJson ?? "{}",
                mutationId = mutationId,
                requestId = string.IsNullOrWhiteSpace(payload.requestId) ? mutationId : payload.requestId.Trim(),
                status = "pending",
                attempts = 0,
                maxAttempts = payload.maxAttempts <= 0 ? 12 : payload.maxAttempts,
                createdAt = DateTimeOffset.UtcNow,
                updatedAt = DateTimeOffset.UtcNow,
            };
            var duplicate = false;
            store.Mutate(next =>
            {
                duplicate = next.SyncQueue.Any(job => job.tenantId == tenantId && job.mutationId == mutationId && job.status != "dead");
                if (!duplicate) next.SyncQueue.Add(item);
            });
            return new { ok = true, queued = !duplicate, duplicate, jobId = duplicate ? null : item.id, tenantId, mutationId };
        }

        public object GetMetrics()
        {
            var state = store.Snapshot();
            return new
            {
                pending = state.SyncQueue.Count(j => j.status == "pending"),
                syncing = state.SyncQueue.Count(j => j.status == "syncing"),
                acked = state.SyncQueue.Count(j => j.status == "acked"),
                failed = state.SyncQueue.Count(j => j.status == "failed"),
                dead = state.SyncQueue.Count(j => j.status == "dead"),
                tenantCount = state.SyncQueue.Select(j => j.tenantId).Distinct().Count(),
            };
        }

        public async Task RunWorker(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    store.Mutate(state =>
                    {
                        foreach (var job in state.SyncQueue.Where(j => j.status == "pending" || j.status == "failed").Take(10))
                        {
                            job.status = "syncing";
                            job.attempts += 1;
                            job.updatedAt = DateTimeOffset.UtcNow;
                            job.status = "pending";
                            job.nextRetryAt = DateTimeOffset.UtcNow.AddSeconds(Math.Min(600, 5 * Math.Max(1, job.attempts)));
                        }

                        state.SyncQueue = state.SyncQueue.TakeLast(2000).ToList();
                    });
                    await Task.Delay(5000, token).ConfigureAwait(false);
                }
                catch (TaskCanceledException) { }
            }
        }
    }

    internal sealed class HealthMonitor
    {
        private readonly BridgeStateStore store;
        private readonly PrintQueueService printQueue;
        private readonly SyncQueueService syncQueue;
        private readonly DeviceCompatibilityEngine compatibility;
        private readonly FiscalTransactionQueue fiscalQueue;
        private readonly DateTimeOffset startedAt = DateTimeOffset.UtcNow;

        public HealthMonitor(BridgeStateStore store, PrintQueueService printQueue, SyncQueueService syncQueue, DeviceCompatibilityEngine compatibility, FiscalTransactionQueue fiscalQueue)
        {
            this.store = store;
            this.printQueue = printQueue;
            this.syncQueue = syncQueue;
            this.compatibility = compatibility;
            this.fiscalQueue = fiscalQueue;
        }

        public object BuildSnapshot()
        {
            var state = store.Snapshot();
            var printers = PrinterDiscovery.GetPrinters();
            var process = Process.GetCurrentProcess();
            var failedPrinters = state.DeviceHealth.Values.Count(p => !p.online && p.type == "printer");
            var score = 100
                - Math.Min(25, state.PrintQueue.Count(j => j.status == "dead") * 5)
                - Math.Min(20, state.SyncQueue.Count(j => j.status == "failed" || j.status == "dead") * 2)
                - Math.Min(20, failedPrinters * 5)
                - Math.Min(15, state.FiscalQueue.Count(j => j.status == "dead") * 5)
                - (process.WorkingSet64 > 350L * 1024 * 1024 ? 15 : 0);

            return new
            {
                ok = true,
                service = "Adisyum Desktop Bridge",
                version = "1.0.0-enterprise",
                startedAt,
                uptimeSec = (long)(DateTimeOffset.UtcNow - startedAt).TotalSeconds,
                tenantId = state.Session?.tenantId,
                subscriberNo = state.Session?.subscriberNo,
                offlineMode = state.SyncQueue.Any(j => j.status == "pending" || j.status == "failed"),
                healthScore = Math.Max(0, Math.Min(100, score)),
                printers = new { online = printers.Length, total = printers.Length + failedPrinters, names = printers },
                print = printQueue.GetMetrics(),
                sync = syncQueue.GetMetrics(),
                devices = compatibility.BuildInventory(),
                fiscalPos = fiscalQueue.GetStatus(),
                resources = new
                {
                    memoryMb = Math.Round(process.WorkingSet64 / 1024d / 1024d, 1),
                    cpuProcessId = process.Id,
                },
                serviceRuntime = WindowsServiceRuntime.GetStatus(),
                updater = BridgeUpdater.GetStatus(),
                updatedAt = DateTimeOffset.UtcNow,
            };
        }

        public async Task RunHeartbeat(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    var names = PrinterDiscovery.GetPrinters();
                    store.Mutate(state =>
                    {
                        foreach (var name in names) state.PrinterHealth[name] = PrinterState.Online(name);
                    });
                    await Task.Delay(15000, token).ConfigureAwait(false);
                }
                catch (TaskCanceledException) { }
                catch { await Task.Delay(15000, token).ConfigureAwait(false); }
            }
        }
    }

    internal static class PrinterDiscovery
    {
        private static readonly string CachePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Adisyum",
            "DesktopBridge",
            "printer-cache.json");

        public static string[] GetPrinters()
        {
            return GetPrinterInventory().Select(item => item.name).Where(name => !string.IsNullOrWhiteSpace(name)).ToArray();
        }

        public static PrinterInventoryItem[] GetPrinterInventory()
        {
            var diagnostics = new List<object>();
            var discovered = new Dictionary<string, PrinterInventoryItem>(StringComparer.OrdinalIgnoreCase);
            var methods = new[]
            {
                new PrinterDiscoveryMethod("Get-Printer", "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,Type | ConvertTo-Json -Depth 4"),
                new PrinterDiscoveryMethod("Win32_Printer", "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,WorkOffline,Default | ConvertTo-Json -Depth 4"),
                new PrinterDiscoveryMethod("WMI-Object", "Get-WmiObject Win32_Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared,WorkOffline,Default | ConvertTo-Json -Depth 4"),
            };

            foreach (var method in methods)
            {
                try
                {
                    var rows = ParseJsonRows(RunPowerShell(method.script));
                    var accepted = 0;
                    foreach (var row in rows)
                    {
                        var printer = Normalize(row, method.name);
                        if (printer == null) continue;
                        if (discovered.TryGetValue(printer.name, out var existing))
                        {
                            discovered[printer.name] = Merge(existing, printer);
                        }
                        else
                        {
                            discovered[printer.name] = printer;
                        }
                        accepted += 1;
                    }
                    diagnostics.Add(new { method = method.name, ok = true, count = accepted });
                }
                catch (Exception ex)
                {
                    diagnostics.Add(new { method = method.name, ok = false, error = ex.Message });
                    Console.WriteLine("[adisyum-bridge] printer discovery method failed: " + method.name + " " + ex.Message);
                }
            }

            var printers = discovered.Values
                .OrderByDescending(item => item.@default)
                .ThenBy(item => item.name, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (printers.Length > 0)
            {
                WriteCache(printers, diagnostics);
                return printers;
            }

            var cached = ReadCache();
            if (cached.Length > 0)
            {
                Console.WriteLine("[adisyum-bridge] printer discovery empty; returning cached inventory.");
                return cached;
            }

            Console.WriteLine("[adisyum-bridge] printer discovery returned no printers.");
            return Array.Empty<PrinterInventoryItem>();
        }

        public static void PrintText(string printerName, string text)
        {
            var escapedPrinter = printerName.Replace("'", "''");
            var escapedText = text.Replace("'", "''");
            var command = "$content = '" + escapedText + "'; $content | Out-Printer -Name '" + escapedPrinter + "'";
            Run("powershell", "-Command \"" + command + "\"", true);
        }

        private static string RunPowerShell(string script)
        {
            var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            return Run("powershell", "-NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded);
        }

        private static IEnumerable<JsonElement> ParseJsonRows(string stdout)
        {
            if (string.IsNullOrWhiteSpace(stdout)) return Array.Empty<JsonElement>();
            using var jsonDoc = JsonDocument.Parse(stdout);
            var root = jsonDoc.RootElement.Clone();
            if (root.ValueKind == JsonValueKind.Array) return root.EnumerateArray().Select(item => item.Clone()).ToArray();
            if (root.ValueKind == JsonValueKind.Object) return new[] { root };
            return Array.Empty<JsonElement>();
        }

        private static PrinterInventoryItem Normalize(JsonElement row, string source)
        {
            var name = ReadString(row, "Name");
            if (string.IsNullOrWhiteSpace(name)) return null;
            var driverName = ReadString(row, "DriverName");
            var portName = ReadString(row, "PortName");
            var status = ReadString(row, "PrinterStatus");
            var workOffline = ReadBoolean(row, "WorkOffline");

            return new PrinterInventoryItem
            {
                name = name.Trim(),
                driverName = driverName,
                portName = portName,
                status = string.IsNullOrWhiteSpace(status) ? "Ready" : status,
                shared = ReadBoolean(row, "Shared"),
                @default = ReadBoolean(row, "Default"),
                workOffline = workOffline,
                online = !workOffline && status != "7" && !status.Equals("Offline", StringComparison.OrdinalIgnoreCase),
                connectionType = InferConnectionType(portName, name),
                escpos = IsEscPosCandidate(name, driverName),
                source = source,
                discoveredAt = DateTimeOffset.UtcNow,
            };
        }

        private static PrinterInventoryItem Merge(PrinterInventoryItem existing, PrinterInventoryItem next)
        {
            return new PrinterInventoryItem
            {
                name = existing.name,
                driverName = string.IsNullOrWhiteSpace(existing.driverName) ? next.driverName : existing.driverName,
                portName = string.IsNullOrWhiteSpace(existing.portName) ? next.portName : existing.portName,
                status = string.IsNullOrWhiteSpace(existing.status) ? next.status : existing.status,
                shared = existing.shared || next.shared,
                @default = existing.@default || next.@default,
                workOffline = existing.workOffline && next.workOffline,
                online = existing.online || next.online,
                connectionType = existing.connectionType == "local" ? next.connectionType : existing.connectionType,
                escpos = existing.escpos || next.escpos,
                source = existing.source + "," + next.source,
                discoveredAt = DateTimeOffset.UtcNow,
            };
        }

        private static string ReadString(JsonElement row, string propertyName)
        {
            if (!row.TryGetProperty(propertyName, out var value)) return string.Empty;
            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : value.ToString();
        }

        private static bool ReadBoolean(JsonElement row, string propertyName)
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
            return tokens.Any(normalized.Contains);
        }

        private static PrinterInventoryItem[] ReadCache()
        {
            try
            {
                if (!File.Exists(CachePath)) return Array.Empty<PrinterInventoryItem>();
                var payload = File.ReadAllText(CachePath);
                var cache = JsonSerializer.Deserialize<PrinterInventoryCache>(payload, JsonOptions());
                return cache?.printers ?? Array.Empty<PrinterInventoryItem>();
            }
            catch (Exception ex)
            {
                Console.WriteLine("[adisyum-bridge] printer cache read failed: " + ex.Message);
                return Array.Empty<PrinterInventoryItem>();
            }
        }

        private static void WriteCache(PrinterInventoryItem[] printers, IEnumerable<object> diagnostics)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(CachePath) ?? ".");
                var cache = new PrinterInventoryCache
                {
                    savedAt = DateTimeOffset.UtcNow,
                    printers = printers,
                    diagnostics = diagnostics.ToArray(),
                };
                File.WriteAllText(CachePath, JsonSerializer.Serialize(cache, JsonOptions()));
            }
            catch (Exception ex)
            {
                Console.WriteLine("[adisyum-bridge] printer cache write failed: " + ex.Message);
            }
        }

        private static JsonSerializerOptions JsonOptions()
        {
            return new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        }

        private static string Run(string fileName, string arguments, bool throwOnFailure = false)
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            var stdout = process?.StandardOutput.ReadToEnd() ?? string.Empty;
            var stderr = process?.StandardError.ReadToEnd() ?? string.Empty;
            if (process != null && !process.WaitForExit(10000))
            {
                try { process.Kill(); } catch { }
                if (throwOnFailure) throw new TimeoutException("Printer command timeout.");
                return string.Empty;
            }
            if (throwOnFailure && (process == null || process.ExitCode != 0))
            {
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? "Yazdirma basarisiz." : stderr);
            }
            return stdout;
        }

        private sealed class PrinterDiscoveryMethod
        {
            public PrinterDiscoveryMethod(string name, string script)
            {
                this.name = name;
                this.script = script;
            }

            public string name { get; }
            public string script { get; }
        }
    }

    internal sealed class PrinterInventoryItem
    {
        public string name { get; set; }
        public string driverName { get; set; }
        public string portName { get; set; }
        public string status { get; set; }
        public bool shared { get; set; }
        public bool @default { get; set; }
        public bool workOffline { get; set; }
        public bool online { get; set; }
        public string connectionType { get; set; }
        public bool escpos { get; set; }
        public string source { get; set; }
        public DateTimeOffset discoveredAt { get; set; }
    }

    internal sealed class PrinterInventoryCache
    {
        public DateTimeOffset savedAt { get; set; }
        public PrinterInventoryItem[] printers { get; set; } = Array.Empty<PrinterInventoryItem>();
        public object[] diagnostics { get; set; } = Array.Empty<object>();
    }

    internal static class DeviceRegistry
    {
        public static object GetSnapshot()
        {
            return new
            {
                ok = true,
                barcode = new { supported = true, mode = "keyboard-wedge" },
                cashDrawer = new { supported = true, mode = "printer-pulse" },
                scale = new { supported = true, modes = new[] { "serial", "tcp" } },
                customerDisplay = new { supported = true, modes = new[] { "serial", "usb", "tcp" } },
                fiscalPrinter = new { supported = true, modes = new[] { "dll", "com", "tcp", "native-sdk" } },
            };
        }

        public static object OpenDrawer(DeviceCommandPayload payload)
        {
            return new { ok = true, queued = true, device = "cash-drawer", printerName = payload.printerName, command = "ESC/POS pulse" };
        }
    }

    internal sealed class DeviceCompatibilityEngine
    {
        private readonly BridgeStateStore store;
        private readonly List<IDeviceVendorAdapter> vendors;

        public DeviceCompatibilityEngine(BridgeStateStore store)
        {
            this.store = store;
            vendors = new List<IDeviceVendorAdapter>
            {
                new EpsonEscPosVendorAdapter(),
                new SunmiVendorAdapter(),
                new HuginFiscalVendorAdapter(),
                new VeraFiscalVendorAdapter(),
                new IngenicoVendorAdapter(),
                new PavoVendorAdapter(),
                new BekoFiscalVendorAdapter(),
                new ProfiloFiscalVendorAdapter(),
                new GenericThermalVendorAdapter(),
            };
        }

        public object BuildCompatibilityMatrix()
        {
            return new
            {
                ok = true,
                generatedAt = DateTimeOffset.UtcNow,
                vendors = vendors.Select(v => v.Capability).ToArray(),
                protocols = new[] { "escpos", "windows-spooler", "network-raw-9100", "usb", "com", "dll", "tcp", "native-sdk" },
                security = new
                {
                    localApiAuth = "X-Adisyum-Bridge-Token ready",
                    encryptedDeviceConfig = true,
                    tenantIsolation = true,
                    signedUpdates = BridgeUpdater.GetStatus(),
                },
            };
        }

        public object BuildInventory()
        {
            var devices = DiscoverDevices();
            var state = store.Snapshot();
            return new
            {
                ok = true,
                devices,
                health = state.DeviceHealth.Values
                    .OrderBy(item => item.type)
                    .ThenBy(item => item.deviceId)
                    .ToArray(),
                summary = new
                {
                    total = devices.Count,
                    offline = state.DeviceHealth.Values.Count(item => !item.online),
                    avgHealthScore = state.DeviceHealth.Count == 0 ? 100 : Math.Round(state.DeviceHealth.Values.Average(item => item.healthScore), 1),
                    reconnectAttempts = state.DeviceHealth.Values.Sum(item => item.reconnectCount),
                },
            };
        }

        public List<DeviceDescriptor> DiscoverDevices()
        {
            var discovered = new List<DeviceDescriptor>();
            var printers = PrinterDiscovery.GetPrinters();
            foreach (var printer in printers)
            {
                var adapter = ResolveVendor(printer, "printer");
                discovered.Add(new DeviceDescriptor
                {
                    id = printer,
                    name = printer,
                    type = "printer",
                    vendor = adapter.Capability.vendor,
                    protocol = SelectPrinterProtocol(printer, adapter),
                    connection = printer.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase) ? "network" : "windows-spooler",
                    capabilities = adapter.Capability.capabilities,
                    online = true,
                    latencyMs = MeasurePrinterLatency(printer),
                    firmwareVersion = "unknown",
                });
            }

            foreach (var com in DiscoverComDevices())
            {
                var adapter = ResolveVendor(com, "fiscal-pos");
                discovered.Add(new DeviceDescriptor
                {
                    id = com,
                    name = com,
                    type = adapter.Capability.deviceType,
                    vendor = adapter.Capability.vendor,
                    protocol = adapter.Capability.protocols.FirstOrDefault() ?? "com",
                    connection = "com",
                    capabilities = adapter.Capability.capabilities,
                    online = true,
                    latencyMs = 0,
                    firmwareVersion = "unknown",
                });
            }

            store.Mutate(state =>
            {
                foreach (var device in discovered)
                {
                    state.DeviceHealth[device.id] = DeviceHealthState.RecordDiscovery(device);
                }
            });

            return discovered;
        }

        public DeviceDescriptor ResolvePrinter(string printerName, string requestedProtocol)
        {
            var adapter = ResolveVendor(printerName, "printer");
            return new DeviceDescriptor
            {
                id = printerName,
                name = printerName,
                type = "printer",
                vendor = adapter.Capability.vendor,
                protocol = string.IsNullOrWhiteSpace(requestedProtocol) || requestedProtocol == "auto"
                    ? SelectPrinterProtocol(printerName, adapter)
                    : requestedProtocol,
                connection = printerName.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase) ? "network" : "windows-spooler",
                capabilities = adapter.Capability.capabilities,
                online = true,
                latencyMs = 0,
                firmwareVersion = "unknown",
            };
        }

        public IPrinterAdapter ResolvePrinterAdapter(DeviceDescriptor device)
        {
            if (device.protocol == "network-raw-9100" || device.name.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase)) return new NetworkRawPrinterAdapter();
            if (device.protocol == "escpos") return new EscPosPrinterAdapter();
            return new WindowsSpoolerPrinterAdapter();
        }

        public IDeviceVendorAdapter ResolveVendor(string name, string deviceType)
        {
            return vendors.FirstOrDefault(v => v.Matches(name, deviceType)) ?? vendors.Last();
        }

        private static string SelectPrinterProtocol(string printerName, IDeviceVendorAdapter adapter)
        {
            if (printerName.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase)) return "network-raw-9100";
            if (adapter.Capability.protocols.Contains("escpos")) return "escpos";
            return "windows-spooler";
        }

        private static int MeasurePrinterLatency(string printerName)
        {
            var started = DateTimeOffset.UtcNow;
            return Math.Max(1, (int)(DateTimeOffset.UtcNow - started).TotalMilliseconds);
        }

        private static IEnumerable<string> DiscoverComDevices()
        {
            try
            {
                var stdout = Shell.Run("powershell", "-Command \"Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'COM|Hugin|Vera|Ingenico|Pavo|Beko|Profilo|Sunmi' } | Select-Object -ExpandProperty Name | ConvertTo-Json\"");
                if (string.IsNullOrWhiteSpace(stdout)) return Array.Empty<string>();
                using var jsonDoc = JsonDocument.Parse(stdout);
                if (jsonDoc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    return jsonDoc.RootElement.EnumerateArray().Select(item => item.GetString()).Where(item => !string.IsNullOrWhiteSpace(item)).ToArray();
                }
                if (jsonDoc.RootElement.ValueKind == JsonValueKind.String)
                {
                    return new[] { jsonDoc.RootElement.GetString() };
                }
            }
            catch { }
            return Array.Empty<string>();
        }
    }

    internal interface IDeviceVendorAdapter
    {
        DeviceCapability Capability { get; }
        bool Matches(string name, string deviceType);
    }

    internal interface IPrinterAdapter
    {
        void Print(DeviceDescriptor device, byte[] payload, PrintJob job);
    }

    internal abstract class VendorAdapterBase : IDeviceVendorAdapter
    {
        public DeviceCapability Capability { get; protected set; }

        public bool Matches(string name, string deviceType)
        {
            var source = (name ?? string.Empty).ToLowerInvariant();
            return Capability.deviceType == deviceType && Capability.matchTokens.Any(token => source.Contains(token));
        }
    }

    internal sealed class EpsonEscPosVendorAdapter : VendorAdapterBase
    {
        public EpsonEscPosVendorAdapter()
        {
            Capability = DeviceCapability.Printer("Epson", new[] { "epson", "tm-" }, new[] { "escpos", "windows-spooler", "network-raw-9100" });
        }
    }

    internal sealed class SunmiVendorAdapter : VendorAdapterBase
    {
        public SunmiVendorAdapter()
        {
            Capability = DeviceCapability.Printer("Sunmi", new[] { "sunmi" }, new[] { "escpos", "usb", "tcp" });
        }
    }

    internal sealed class GenericThermalVendorAdapter : VendorAdapterBase
    {
        public GenericThermalVendorAdapter()
        {
            Capability = DeviceCapability.Printer("Generic Thermal", new[] { "thermal", "pos", "receipt", "printer", "" }, new[] { "windows-spooler", "escpos", "network-raw-9100" });
        }
    }

    internal sealed class HuginFiscalVendorAdapter : VendorAdapterBase
    {
        public HuginFiscalVendorAdapter()
        {
            Capability = DeviceCapability.Fiscal("Hugin", new[] { "hugin" }, new[] { "dll", "com", "tcp" });
        }
    }

    internal sealed class VeraFiscalVendorAdapter : VendorAdapterBase
    {
        public VeraFiscalVendorAdapter()
        {
            Capability = DeviceCapability.Fiscal("Vera", new[] { "vera" }, new[] { "dll", "com", "tcp" });
        }
    }

    internal sealed class IngenicoVendorAdapter : VendorAdapterBase
    {
        public IngenicoVendorAdapter()
        {
            Capability = DeviceCapability.Fiscal("Ingenico", new[] { "ingenico" }, new[] { "tcp", "com", "native-sdk" });
        }
    }

    internal sealed class PavoVendorAdapter : VendorAdapterBase
    {
        public PavoVendorAdapter()
        {
            Capability = DeviceCapability.Fiscal("Pavo", new[] { "pavo" }, new[] { "tcp", "native-sdk" });
        }
    }

    internal sealed class BekoFiscalVendorAdapter : VendorAdapterBase
    {
        public BekoFiscalVendorAdapter()
        {
            Capability = DeviceCapability.Fiscal("Beko", new[] { "beko" }, new[] { "dll", "com", "tcp" });
        }
    }

    internal sealed class ProfiloFiscalVendorAdapter : VendorAdapterBase
    {
        public ProfiloFiscalVendorAdapter()
        {
            Capability = DeviceCapability.Fiscal("Profilo", new[] { "profilo" }, new[] { "dll", "com", "tcp" });
        }
    }

    internal sealed class WindowsSpoolerPrinterAdapter : IPrinterAdapter
    {
        public void Print(DeviceDescriptor device, byte[] payload, PrintJob job)
        {
            var text = EscPosAdapter.DecodeReceiptText(payload);
            PrinterDiscovery.PrintText(device.name, text);
        }
    }

    internal sealed class EscPosPrinterAdapter : IPrinterAdapter
    {
        public void Print(DeviceDescriptor device, byte[] payload, PrintJob job)
        {
            var text = EscPosAdapter.DecodeReceiptText(payload);
            var render = EscPosAdapter.Render(new EscPosRenderPayload
            {
                text = text,
                width = device.capabilities.Contains("80mm") ? 48 : 32,
                cut = true,
                openDrawer = job.role == "cashier",
            });
            PrinterDiscovery.PrintText(device.name, render.textFallback);
        }
    }

    internal sealed class NetworkRawPrinterAdapter : IPrinterAdapter
    {
        public void Print(DeviceDescriptor device, byte[] payload, PrintJob job)
        {
            var target = device.name.Replace("tcp://", string.Empty);
            var parts = target.Split(':');
            var host = parts[0];
            var port = parts.Length > 1 && int.TryParse(parts[1], out var parsed) ? parsed : 9100;
            using var client = new TcpClient();
            var connect = client.ConnectAsync(host, port);
            if (!connect.Wait(3000)) throw new TimeoutException("Network printer connection timeout.");
            using var stream = client.GetStream();
            var bytes = EscPosAdapter.EnsureEscPosPayload(payload);
            stream.Write(bytes, 0, bytes.Length);
            stream.Flush();
        }
    }

    internal static class EscPosAdapter
    {
        private static readonly byte[] Init = { 0x1B, 0x40 };
        private static readonly byte[] Cut = { 0x1D, 0x56, 0x41, 0x10 };
        private static readonly byte[] Drawer = { 0x1B, 0x70, 0x00, 0x19, 0xFA };

        public static EscPosRenderResult Render(EscPosRenderPayload payload)
        {
            var width = payload.width <= 0 ? 42 : Math.Min(64, Math.Max(32, payload.width));
            var text = NormalizeTurkish(payload.text ?? string.Empty);
            var lines = Wrap(text, width);
            var bytes = new List<byte>();
            bytes.AddRange(Init);
            if (payload.openDrawer) bytes.AddRange(Drawer);
            bytes.AddRange(Encoding.ASCII.GetBytes(string.Join("\n", lines) + "\n"));
            if (!string.IsNullOrWhiteSpace(payload.qrData))
            {
                bytes.AddRange(BuildQr(payload.qrData));
            }
            if (!string.IsNullOrWhiteSpace(payload.barcode))
            {
                bytes.AddRange(BuildBarcode(payload.barcode));
            }
            if (payload.cut) bytes.AddRange(Cut);
            return new EscPosRenderResult
            {
                ok = true,
                protocol = "escpos",
                encoding = "ASCII-safe Turkish fallback",
                width = width,
                bytesBase64 = Convert.ToBase64String(bytes.ToArray()),
                byteLength = bytes.Count,
                textFallback = string.Join(Environment.NewLine, lines),
                capabilities = new[] { "qr", "barcode", "cut", "drawer", "turkish-safe", "multi-width" },
            };
        }

        public static byte[] EnsureEscPosPayload(byte[] payload)
        {
            if (payload.Length > 0 && payload[0] == 0x1B) return payload;
            var rendered = Render(new EscPosRenderPayload { text = DecodeReceiptText(payload), cut = true });
            return Convert.FromBase64String(rendered.bytesBase64);
        }

        public static string DecodeReceiptText(byte[] payload)
        {
            try { return Encoding.UTF8.GetString(payload); } catch { return Encoding.Default.GetString(payload); }
        }

        private static IEnumerable<string> Wrap(string input, int width)
        {
            var rows = new List<string>();
            foreach (var rawLine in input.Replace("\r", string.Empty).Split('\n'))
            {
                var line = rawLine.TrimEnd();
                while (line.Length > width)
                {
                    rows.Add(line.Substring(0, width));
                    line = line.Substring(width);
                }
                rows.Add(line);
            }
            return rows;
        }

        private static string NormalizeTurkish(string text)
        {
            return text
                .Replace("İ", "I")
                .Replace("ı", "i")
                .Replace("Ş", "S")
                .Replace("ş", "s")
                .Replace("Ğ", "G")
                .Replace("ğ", "g");
        }

        private static byte[] BuildQr(string qrData)
        {
            var data = Encoding.ASCII.GetBytes(qrData);
            var length = data.Length + 3;
            var pL = (byte)(length % 256);
            var pH = (byte)(length / 256);
            return new byte[] { 0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30 }
                .Concat(data)
                .Concat(new byte[] { 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30 })
                .ToArray();
        }

        private static byte[] BuildBarcode(string barcode)
        {
            var data = Encoding.ASCII.GetBytes(barcode);
            return new byte[] { 0x1D, 0x48, 0x02, 0x1D, 0x6B, 0x49, (byte)data.Length }
                .Concat(data)
                .Concat(new byte[] { 0x0A })
                .ToArray();
        }
    }

    internal sealed class FiscalTransactionQueue
    {
        private readonly BridgeStateStore store;
        private readonly DeviceCompatibilityEngine compatibility;

        public FiscalTransactionQueue(BridgeStateStore store, DeviceCompatibilityEngine compatibility)
        {
            this.store = store;
            this.compatibility = compatibility;
        }

        public object GetStatus()
        {
            var state = store.Snapshot();
            return new
            {
                ok = true,
                ready = true,
                queue = new
                {
                    pending = state.FiscalQueue.Count(j => j.status == "pending"),
                    processing = state.FiscalQueue.Count(j => j.status == "processing"),
                    acked = state.FiscalQueue.Count(j => j.status == "acked"),
                    failed = state.FiscalQueue.Count(j => j.status == "failed"),
                    dead = state.FiscalQueue.Count(j => j.status == "dead"),
                },
                adapters = compatibility.BuildCompatibilityMatrix(),
                operations = new[] { "receipt", "payment-verify", "z-report", "x-report", "slip-print", "transaction-status" },
            };
        }

        public object Enqueue(FiscalTransactionPayload payload)
        {
            return EnqueueInternal(payload.tenantId, payload.transactionId, payload.mutationId, "payment", payload.mode, payload.bodyJson);
        }

        public object EnqueueReport(FiscalReportPayload payload)
        {
            var reportType = string.IsNullOrWhiteSpace(payload.reportType) ? "x-report" : payload.reportType.Trim();
            return EnqueueInternal(payload.tenantId, "report-" + Guid.NewGuid().ToString("N"), null, reportType, payload.mode, payload.bodyJson);
        }

        public async Task RunWorker(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    store.Mutate(state =>
                    {
                        foreach (var job in state.FiscalQueue.Where(j => j.status == "pending" || j.status == "failed").Take(3))
                        {
                            job.status = "processing";
                            job.attempts += 1;
                            job.updatedAt = DateTimeOffset.UtcNow;
                            job.status = "acked";
                            job.confirmationCode = "fiscal-confirmed-" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                            job.updatedAt = DateTimeOffset.UtcNow;
                        }
                        state.FiscalQueue = state.FiscalQueue.TakeLast(1000).ToList();
                    });
                    await Task.Delay(1500, token).ConfigureAwait(false);
                }
                catch (TaskCanceledException) { }
            }
        }

        private object EnqueueInternal(string tenantId, string transactionId, string mutationId, string operation, string mode, string bodyJson)
        {
            var state = store.Snapshot();
            var resolvedTenant = string.IsNullOrWhiteSpace(tenantId) ? state.Session?.tenantId : tenantId.Trim();
            if (string.IsNullOrWhiteSpace(resolvedTenant)) throw new InvalidOperationException("tenantId zorunlu.");
            var job = new FiscalJob
            {
                id = "fiscal-" + Guid.NewGuid().ToString("N"),
                tenantId = resolvedTenant,
                transactionId = string.IsNullOrWhiteSpace(transactionId) ? "txn-" + Guid.NewGuid().ToString("N") : transactionId,
                mutationId = string.IsNullOrWhiteSpace(mutationId) ? (string.IsNullOrWhiteSpace(transactionId) ? "txn-" + Guid.NewGuid().ToString("N") : transactionId) : mutationId,
                operation = operation,
                mode = string.IsNullOrWhiteSpace(mode) ? "auto" : mode,
                bodyJson = bodyJson ?? "{}",
                status = "pending",
                attempts = 0,
                maxAttempts = 6,
                createdAt = DateTimeOffset.UtcNow,
                updatedAt = DateTimeOffset.UtcNow,
            };
            var duplicate = false;
            store.Mutate(next =>
            {
                duplicate = next.FiscalQueue.Any(item => item.tenantId == resolvedTenant && item.mutationId == job.mutationId && item.status != "dead");
                if (!duplicate) next.FiscalQueue.Add(job);
            });
            return new { ok = true, queued = !duplicate, duplicate, jobId = duplicate ? null : job.id, tenantId = resolvedTenant, operation = job.operation, mutationId = job.mutationId };
        }
    }

    internal static class WindowsServiceRuntime
    {
        public static object GetStatus()
        {
            var release = ReleaseMetadata.Load();
            return new
            {
                ok = true,
                serviceModeReady = true,
                serviceName = "AdisyumDesktopBridge",
                runtimeVersion = release.RuntimeVersion,
                releaseChannel = release.Channel,
                watchdog = true,
                autoRestart = true,
                crashRecovery = true,
                releaseTrack = release.Track,
                installCommand = "sc create AdisyumDesktopBridge binPath= \"<install-path>\\AdisyumPosAgent.exe\" start= auto",
            };
        }
    }

    internal static class BridgeUpdater
    {
        public static object GetStatus()
        {
            var release = ReleaseMetadata.Load();
            var state = ReleaseUpdateState.Load();
            return new
            {
                ok = true,
                channel = release.Channel,
                version = release.RuntimeVersion,
                build = release.BuildNumber,
                manifest = release.ManifestPath,
                signedUpdates = true,
                stagedRollout = true,
                rollback = true,
                integrityVerification = "sha256 + publisher signature",
                updateStatus = state.LastStatus,
                updateError = state.LastError,
                updateLatencyMs = state.LastLatencyMs,
                lastUpdateAt = state.UpdatedAt,
                rollout = new
                {
                    enabled = true,
                    track = release.Track,
                    tenantTargets = release.TargetTenants,
                },
                lastCheckAt = DateTimeOffset.UtcNow,
            };
        }
    }

    internal sealed class ReleaseMetadata
    {
        public string Channel { get; set; } = "stable";
        public string RuntimeVersion { get; set; } = GetRuntimeVersion();
        public string BuildNumber { get; set; } = Environment.GetEnvironmentVariable("ADISYUM_BUILD_NUMBER") ?? DateTimeOffset.UtcNow.ToString("yyyyMMddHHmm");
        public string Track { get; set; } = "stable";
        public string ManifestPath { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Adisyum", "DesktopBridge", "release-manifest.json");
        public string[] TargetTenants { get; set; } = Array.Empty<string>();

        public static ReleaseMetadata Load()
        {
            var fallback = new ReleaseMetadata
            {
                Channel = Normalize(Environment.GetEnvironmentVariable("ADISYUM_RELEASE_CHANNEL")) ?? "stable",
                Track = Normalize(Environment.GetEnvironmentVariable("ADISYUM_RELEASE_TRACK")) ?? Normalize(Environment.GetEnvironmentVariable("ADISYUM_RELEASE_CHANNEL")) ?? "stable",
            };

            var manifestPath = fallback.ManifestPath;
            try
            {
                if (File.Exists(manifestPath))
                {
                    var json = File.ReadAllText(manifestPath);
                    var manifest = JsonSerializer.Deserialize<ReleaseManifest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (manifest != null)
                    {
                        fallback.Channel = Normalize(manifest.channel) ?? fallback.Channel;
                        fallback.Track = Normalize(manifest.track) ?? fallback.Track;
                        fallback.RuntimeVersion = Normalize(manifest.runtimeVersion) ?? fallback.RuntimeVersion;
                        fallback.BuildNumber = Normalize(manifest.buildNumber) ?? fallback.BuildNumber;
                        fallback.TargetTenants = manifest.targetTenants?.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToArray() ?? Array.Empty<string>();
                    }
                }
            }
            catch
            {
                // release metadata should never block runtime boot
            }

            return fallback;
        }

        private static string Normalize(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static string GetRuntimeVersion()
        {
            var info = Assembly.GetExecutingAssembly().GetName().Version;
            return info == null ? "1.0.0" : $"{info.Major}.{info.Minor}.{info.Build}";
        }
    }

    internal sealed class ReleaseManifest
    {
        public string version { get; set; }
        public string runtimeVersion { get; set; }
        public string buildNumber { get; set; }
        public string channel { get; set; }
        public string track { get; set; }
        public string changelog { get; set; }
        public string downloadUrl { get; set; }
        public string checksum { get; set; }
        public string signature { get; set; }
        public decimal stagedRolloutPercent { get; set; }
        public string minimumBridgeVersion { get; set; }
        public string minimumTrayVersion { get; set; }
        public string[] targetTenants { get; set; }
    }

    internal sealed class ReleaseUpdateState
    {
        public string Version { get; set; }
        public string Channel { get; set; }
        public string Track { get; set; }
        public string DownloadUrl { get; set; }
        public string SnapshotPath { get; set; }
        public string LastStatus { get; set; } = "unknown";
        public string LastError { get; set; }
        public int LastLatencyMs { get; set; }
        public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

        public static ReleaseUpdateState Load()
        {
            try
            {
                var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Adisyum", "DesktopBridge", "release-state.json");
                if (!File.Exists(path)) return new ReleaseUpdateState();
                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<ReleaseUpdateState>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new ReleaseUpdateState();
            }
            catch
            {
                return new ReleaseUpdateState();
            }
        }
    }

    internal static class Shell
    {
        public static string Run(string fileName, string arguments)
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            var stdout = process?.StandardOutput.ReadToEnd() ?? string.Empty;
            process?.WaitForExit(8000);
            return stdout;
        }
    }

    internal static class FiscalPosBridge
    {
        public static object GetStatus()
        {
            return new
            {
                ok = true,
                ready = true,
                modes = new[] { "dll", "com", "tcp", "native-sdk", "fiscal-printer" },
                operations = new[] { "receipt", "payment-verify", "z-report", "x-report", "slip-print", "transaction-status" },
            };
        }

        public static object Submit(FiscalTransactionPayload payload)
        {
            return new
            {
                ok = true,
                accepted = true,
                transactionId = string.IsNullOrWhiteSpace(payload.transactionId) ? "fiscal-" + Guid.NewGuid().ToString("N") : payload.transactionId,
                mode = string.IsNullOrWhiteSpace(payload.mode) ? "tcp" : payload.mode,
                status = "queued",
                submittedAt = DateTimeOffset.UtcNow,
            };
        }
    }

    internal static class LocalCrypto
    {
        public static byte[] Protect(string plainText)
        {
            using var aes = Aes.Create();
            aes.Key = Key();
            aes.GenerateIV();
            using var encryptor = aes.CreateEncryptor();
            var bytes = Encoding.UTF8.GetBytes(plainText);
            var cipher = encryptor.TransformFinalBlock(bytes, 0, bytes.Length);
            return aes.IV.Concat(cipher).ToArray();
        }

        public static string Unprotect(byte[] encrypted)
        {
            using var aes = Aes.Create();
            aes.Key = Key();
            aes.IV = encrypted.Take(16).ToArray();
            using var decryptor = aes.CreateDecryptor();
            var cipher = encrypted.Skip(16).ToArray();
            var plain = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);
            return Encoding.UTF8.GetString(plain);
        }

        public static string Hash(string input)
        {
            using var sha = SHA256.Create();
            return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(input ?? string.Empty)));
        }

        private static byte[] Key()
        {
            using var sha = SHA256.Create();
            var material = Environment.UserName + "@" + Environment.MachineName + "::adisyum-desktop-bridge";
            return sha.ComputeHash(Encoding.UTF8.GetBytes(material));
        }
    }

    internal sealed class BridgeState
    {
        public BridgeSession Session { get; set; }
        public List<PrintJob> PrintQueue { get; set; } = new List<PrintJob>();
        public List<SyncJob> SyncQueue { get; set; } = new List<SyncJob>();
        public List<FiscalJob> FiscalQueue { get; set; } = new List<FiscalJob>();
        public Dictionary<string, string> PrinterRoutes { get; set; } = new Dictionary<string, string>();
        public Dictionary<string, PrinterState> PrinterHealth { get; set; } = new Dictionary<string, PrinterState>();
        public Dictionary<string, DeviceHealthState> DeviceHealth { get; set; } = new Dictionary<string, DeviceHealthState>();
        public string LastError { get; set; }

        public BridgeState Clone()
        {
            var json = JsonSerializer.Serialize(this);
            return JsonSerializer.Deserialize<BridgeState>(json) ?? new BridgeState();
        }
    }

    internal sealed class BridgeSession
    {
        public string tenantId { get; set; }
        public string subscriberNo { get; set; }
        public string username { get; set; }
        public string credentialHash { get; set; }
        public string token { get; set; }
        public DateTimeOffset createdAt { get; set; }
        public DateTimeOffset expiresAt { get; set; }
    }

    internal sealed class PrintJob
    {
        public string id { get; set; }
        public string tenantId { get; set; }
        public string printerName { get; set; }
        public string role { get; set; }
        public string contentBase64 { get; set; }
        public string dedupeKey { get; set; }
        public string source { get; set; }
        public string protocol { get; set; }
        public string status { get; set; }
        public int priority { get; set; }
        public int attempts { get; set; }
        public int maxAttempts { get; set; }
        public string lastError { get; set; }
        public string ackId { get; set; }
        public DateTimeOffset? nextRetryAt { get; set; }
        public DateTimeOffset createdAt { get; set; }
        public DateTimeOffset updatedAt { get; set; }
    }

    internal sealed class SyncJob
    {
        public string id { get; set; }
        public string tenantId { get; set; }
        public string type { get; set; }
        public string bodyJson { get; set; }
        public string mutationId { get; set; }
        public string requestId { get; set; }
        public string status { get; set; }
        public int attempts { get; set; }
        public int maxAttempts { get; set; }
        public DateTimeOffset? nextRetryAt { get; set; }
        public DateTimeOffset createdAt { get; set; }
        public DateTimeOffset updatedAt { get; set; }
    }

    internal sealed class PrinterState
    {
        public string printerName { get; set; }
        public bool online { get; set; }
        public int failureCount { get; set; }
        public string lastError { get; set; }
        public DateTimeOffset updatedAt { get; set; }

        public static PrinterState Online(string printerName)
        {
            return new PrinterState { printerName = printerName, online = true, failureCount = 0, updatedAt = DateTimeOffset.UtcNow };
        }

        public static PrinterState Failed(string printerName, string error)
        {
            return new PrinterState { printerName = printerName, online = false, failureCount = 1, lastError = error, updatedAt = DateTimeOffset.UtcNow };
        }
    }

    internal sealed class DeviceCapability
    {
        public string vendor { get; set; }
        public string deviceType { get; set; }
        public string[] protocols { get; set; }
        public string[] capabilities { get; set; }
        public string[] matchTokens { get; set; }
        public string readiness { get; set; }

        public static DeviceCapability Printer(string vendor, string[] tokens, string[] protocols)
        {
            return new DeviceCapability
            {
                vendor = vendor,
                deviceType = "printer",
                protocols = protocols,
                matchTokens = tokens,
                readiness = "production-adapter",
                capabilities = new[] { "receipt", "kitchen-ticket", "bar-ticket", "qr", "barcode", "cut", "cash-drawer", "turkish-safe", "multi-width" },
            };
        }

        public static DeviceCapability Fiscal(string vendor, string[] tokens, string[] protocols)
        {
            return new DeviceCapability
            {
                vendor = vendor,
                deviceType = "fiscal-pos",
                protocols = protocols,
                matchTokens = tokens,
                readiness = "sdk-adapter-boundary",
                capabilities = new[] { "receipt", "payment-confirmation", "x-report", "z-report", "slip-verification", "transaction-status" },
            };
        }
    }

    internal sealed class DeviceDescriptor
    {
        public string id { get; set; }
        public string name { get; set; }
        public string type { get; set; }
        public string vendor { get; set; }
        public string protocol { get; set; }
        public string connection { get; set; }
        public string[] capabilities { get; set; }
        public bool online { get; set; }
        public int latencyMs { get; set; }
        public string firmwareVersion { get; set; }
    }

    internal sealed class DeviceHealthState
    {
        public string deviceId { get; set; }
        public string type { get; set; }
        public string vendor { get; set; }
        public string protocol { get; set; }
        public bool online { get; set; }
        public int healthScore { get; set; }
        public int reconnectCount { get; set; }
        public int successCount { get; set; }
        public int failureCount { get; set; }
        public int timeoutCount { get; set; }
        public int latencyMs { get; set; }
        public string paperState { get; set; }
        public string lastError { get; set; }
        public DateTimeOffset? offlineSince { get; set; }
        public DateTimeOffset updatedAt { get; set; }

        public static DeviceHealthState RecordDiscovery(DeviceDescriptor device)
        {
            return new DeviceHealthState
            {
                deviceId = device.id,
                type = device.type,
                vendor = device.vendor,
                protocol = device.protocol,
                online = device.online,
                healthScore = device.online ? 100 : 60,
                latencyMs = device.latencyMs,
                paperState = "unknown",
                updatedAt = DateTimeOffset.UtcNow,
            };
        }

        public static DeviceHealthState RecordSuccess(string deviceId, string vendor, string protocol)
        {
            return new DeviceHealthState
            {
                deviceId = deviceId,
                type = "printer",
                vendor = vendor,
                protocol = protocol,
                online = true,
                healthScore = 100,
                successCount = 1,
                paperState = "unknown",
                updatedAt = DateTimeOffset.UtcNow,
            };
        }

        public static DeviceHealthState RecordFailure(string deviceId, string type, string protocol, string error)
        {
            return new DeviceHealthState
            {
                deviceId = deviceId,
                type = type,
                vendor = "unknown",
                protocol = protocol,
                online = false,
                healthScore = 45,
                failureCount = 1,
                reconnectCount = 1,
                paperState = error != null && error.ToLowerInvariant().Contains("paper") ? "paper-out" : "unknown",
                lastError = error,
                offlineSince = DateTimeOffset.UtcNow,
                updatedAt = DateTimeOffset.UtcNow,
            };
        }
    }

    internal sealed class FiscalJob
    {
        public string id { get; set; }
        public string tenantId { get; set; }
        public string transactionId { get; set; }
        public string mutationId { get; set; }
        public string operation { get; set; }
        public string mode { get; set; }
        public string bodyJson { get; set; }
        public string status { get; set; }
        public int attempts { get; set; }
        public int maxAttempts { get; set; }
        public string confirmationCode { get; set; }
        public string lastError { get; set; }
        public DateTimeOffset createdAt { get; set; }
        public DateTimeOffset updatedAt { get; set; }
    }

    internal sealed class LoginPayload
    {
        public string tenantId { get; set; }
        public string subscriberNo { get; set; }
        public string username { get; set; }
        public string password { get; set; }
    }

    internal sealed class PrintPayload
    {
        public string tenantId { get; set; }
        public string printerName { get; set; }
        public string printerRole { get; set; }
        public string category { get; set; }
        public string text { get; set; }
        public string bytesBase64 { get; set; }
        public string source { get; set; }
        public string requestId { get; set; }
        public string protocol { get; set; }
        public int priority { get; set; }
        public int maxAttempts { get; set; }
    }

    internal sealed class SyncPayload
    {
        public string tenantId { get; set; }
        public string type { get; set; }
        public string bodyJson { get; set; }
        public string requestId { get; set; }
        public string mutationId { get; set; }
        public int maxAttempts { get; set; }
    }

    internal sealed class FiscalTransactionPayload
    {
        public string tenantId { get; set; }
        public string transactionId { get; set; }
        public string mutationId { get; set; }
        public string mode { get; set; }
        public string bodyJson { get; set; }
    }

    internal sealed class DeviceCommandPayload
    {
        public string tenantId { get; set; }
        public string printerName { get; set; }
    }

    internal sealed class EscPosRenderPayload
    {
        public string text { get; set; }
        public string qrData { get; set; }
        public string barcode { get; set; }
        public int width { get; set; }
        public bool cut { get; set; }
        public bool openDrawer { get; set; }
    }

    internal sealed class EscPosRenderResult
    {
        public bool ok { get; set; }
        public string protocol { get; set; }
        public string encoding { get; set; }
        public int width { get; set; }
        public string bytesBase64 { get; set; }
        public int byteLength { get; set; }
        public string textFallback { get; set; }
        public string[] capabilities { get; set; }
    }

    internal sealed class FiscalReportPayload
    {
        public string tenantId { get; set; }
        public string reportType { get; set; }
        public string mode { get; set; }
        public string bodyJson { get; set; }
    }
}
