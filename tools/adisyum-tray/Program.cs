using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AdisyumTray
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayApplicationContext());
        }
    }

    internal sealed class TrayApplicationContext : ApplicationContext
    {
        private readonly NotifyIcon trayIcon;
        private readonly Timer pollTimer;
        private readonly HttpClient httpClient;
        private readonly string installRoot;
        private readonly string bridgeExePath;
        private readonly ToolStripMenuItem statusItem;
        private readonly ToolStripMenuItem bridgeItem;
        private readonly ToolStripMenuItem printerItem;
        private readonly ToolStripMenuItem websocketItem;
        private readonly ToolStripMenuItem reconnectItem;
        private readonly ToolStripMenuItem versionItem;
        private BridgeStatusSnapshot lastSnapshot = BridgeStatusSnapshot.Offline();
        private bool disposed;

        public TrayApplicationContext()
        {
            installRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Adisyum", "DesktopBridge");
            bridgeExePath = Path.Combine(installRoot, "AdisyumPosAgent.exe");
            httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };

            EnsureAutostart();
            EnsureBridgeRunning();

            statusItem = new ToolStripMenuItem("Durum: başlatılıyor") { Enabled = false };
            bridgeItem = new ToolStripMenuItem("Bridge: unknown") { Enabled = false };
            printerItem = new ToolStripMenuItem("Yazıcı: unknown") { Enabled = false };
            websocketItem = new ToolStripMenuItem("WebSocket: unknown") { Enabled = false };
            reconnectItem = new ToolStripMenuItem("Reconnect: unknown") { Enabled = false };
            versionItem = new ToolStripMenuItem("Sürüm: unknown") { Enabled = false };

            var menu = new ContextMenuStrip();
            menu.Items.Add(statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Adisyum POS'u Aç", null, (_, __) => OpenUrl("https://adisyum.com/app")));
            menu.Items.Add(new ToolStripMenuItem("Adisyum Admin'i Aç", null, (_, __) => OpenUrl("https://adisyum.com/system-admin")));
            menu.Items.Add(new ToolStripMenuItem("Yerel Health", null, (_, __) => OpenUrl("http://127.0.0.1:3001/health")));
            menu.Items.Add(new ToolStripMenuItem("Bridge Yeniden Başlat", null, async (_, __) => await RestartBridgeAsync().ConfigureAwait(false)));
            menu.Items.Add(new ToolStripMenuItem("Güncelleme Kontrolü", null, (_, __) => OpenUrl("https://adisyum.com/pricing")));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(bridgeItem);
            menu.Items.Add(versionItem);
            menu.Items.Add(printerItem);
            menu.Items.Add(websocketItem);
            menu.Items.Add(reconnectItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Çıkış", null, (_, __) => ExitApplication()));

            trayIcon = new NotifyIcon
            {
                Text = "Adisyum Desktop Bridge",
                Icon = SystemIcons.Application,
                Visible = true,
                ContextMenuStrip = menu,
            };
            trayIcon.DoubleClick += (_, __) => OpenUrl("https://adisyum.com/app");

            pollTimer = new Timer { Interval = 8000 };
            pollTimer.Tick += async (_, __) => await RefreshAsync().ConfigureAwait(false);
            pollTimer.Start();

            _ = RefreshAsync();
        }

        private async Task RefreshAsync()
        {
            try
            {
                var snapshot = await QueryStatusAsync().ConfigureAwait(false);
                lastSnapshot = snapshot;
                UpdateUi(snapshot);
            }
            catch
            {
                lastSnapshot = BridgeStatusSnapshot.Offline();
                UpdateUi(lastSnapshot);
            }
        }

        private async Task<BridgeStatusSnapshot> QueryStatusAsync()
        {
            var endpoints = new[]
            {
                "http://127.0.0.1:3001/health",
                "http://127.0.0.1:4891/health",
            };

            foreach (var endpoint in endpoints)
            {
                try
                {
                    var response = await httpClient.GetStringAsync(endpoint).ConfigureAwait(false);
                    return BridgeStatusSnapshot.FromJson(response, endpoint);
                }
                catch
                {
                    // Try next endpoint.
                }
            }

            return BridgeStatusSnapshot.Offline();
        }

        private void UpdateUi(BridgeStatusSnapshot snapshot)
        {
            if (disposed) return;

            var printerText = snapshot.PrinterOnline >= 0 && snapshot.PrinterTotal >= 0
                ? $"{snapshot.PrinterOnline}/{snapshot.PrinterTotal}"
                : "unknown";

            var bridgeText = snapshot.IsOnline
                ? $"online · {snapshot.HealthScore}%"
                : "offline";

            var websocketText = string.IsNullOrWhiteSpace(snapshot.WebsocketState)
                ? (snapshot.IsOnline ? "connected" : "offline")
                : snapshot.WebsocketState;

            var reconnectText = string.IsNullOrWhiteSpace(snapshot.ReconnectState)
                ? "idle"
                : snapshot.ReconnectState;

            var versionText = string.IsNullOrWhiteSpace(snapshot.ReleaseVersion)
                ? "unknown"
                : snapshot.ReleaseVersion;

            var channelText = string.IsNullOrWhiteSpace(snapshot.ReleaseChannel)
                ? "stable"
                : snapshot.ReleaseChannel;

            statusItem.Text = $"Durum: {bridgeText}";
            bridgeItem.Text = $"Bridge: {bridgeText}";
            versionItem.Text = $"Sürüm: {versionText} · {channelText}";
            printerItem.Text = $"Yazıcı: {printerText}";
            websocketItem.Text = $"WebSocket: {websocketText}";
            reconnectItem.Text = $"Reconnect: {reconnectText}";

            trayIcon.Icon = snapshot.IsHealthy ? SystemIcons.Application : (snapshot.IsOnline ? SystemIcons.Warning : SystemIcons.Error);
            trayIcon.Text = Truncate($"Adisyum Desktop Bridge · {bridgeText} · Yazıcı {printerText}", 63);
        }

        private async Task RestartBridgeAsync()
        {
            try
            {
                foreach (var process in Process.GetProcessesByName("AdisyumPosAgent"))
                {
                    try { process.Kill(); } catch { }
                }

                await Task.Delay(1500).ConfigureAwait(false);
                EnsureBridgeRunning();
                await RefreshAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                trayIcon.ShowBalloonTip(4000, "Adisyum", $"Bridge yeniden başlatılamadı: {ex.Message}", ToolTipIcon.Error);
            }
        }

        private void EnsureBridgeRunning()
        {
            if (Process.GetProcessesByName("AdisyumPosAgent").Any())
            {
                return;
            }

            if (!File.Exists(bridgeExePath))
            {
                return;
            }

            var info = new ProcessStartInfo
            {
                FileName = bridgeExePath,
                WorkingDirectory = Path.GetDirectoryName(bridgeExePath),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };

            try
            {
                Process.Start(info);
            }
            catch
            {
                // silent by design
            }
        }

        private void EnsureAutostart()
        {
            try
            {
                var exe = Process.GetCurrentProcess().MainModule?.FileName;
                if (string.IsNullOrWhiteSpace(exe)) return;

                using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true);
                key?.SetValue("AdisyumTray", $"\"{exe}\"", RegistryValueKind.String);
            }
            catch
            {
                // startup should fail closed, not crash the tray
            }
        }

        private static void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch
            {
                // ignored
            }
        }

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return value.Length <= maxLength ? value : value.Substring(0, maxLength - 1);
        }

        private void ExitApplication()
        {
            disposed = true;
            pollTimer.Stop();
            trayIcon.Visible = false;
            trayIcon.Dispose();
            httpClient.Dispose();
            ExitThread();
        }
    }

    internal sealed class BridgeStatusSnapshot
    {
        public bool IsOnline { get; private set; }
        public bool IsHealthy { get; private set; }
        public int HealthScore { get; private set; }
        public int PrinterOnline { get; private set; } = -1;
        public int PrinterTotal { get; private set; } = -1;
        public string ReleaseVersion { get; private set; }
        public string ReleaseChannel { get; private set; }
        public string WebsocketState { get; private set; }
        public string ReconnectState { get; private set; }

        public static BridgeStatusSnapshot Offline()
        {
            return new BridgeStatusSnapshot
            {
                IsOnline = false,
                IsHealthy = false,
                HealthScore = 0,
                PrinterOnline = 0,
                PrinterTotal = 0,
                ReleaseVersion = "1.0.0",
                ReleaseChannel = "stable",
                WebsocketState = "offline",
                ReconnectState = "stopped",
            };
        }

        public static BridgeStatusSnapshot FromJson(string json, string source)
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var snapshot = new BridgeStatusSnapshot
            {
                IsOnline = true,
                HealthScore = root.TryGetProperty("healthScore", out var health) && health.TryGetInt32(out var score) ? score : 100,
                ReleaseVersion = ReadNestedString(root, "updater", "version") ?? ReadNestedString(root, "serviceRuntime", "runtimeVersion") ?? "unknown",
                ReleaseChannel = ReadNestedString(root, "updater", "channel") ?? ReadNestedString(root, "serviceRuntime", "releaseChannel") ?? "stable",
                WebsocketState = ReadNestedString(root, "serviceRuntime", "watchdog") ?? ReadNestedString(root, "updater", "channel") ?? "connected",
                ReconnectState = ReadNestedString(root, "updater", "signedUpdates") ?? source,
                PrinterOnline = ReadNestedInt(root, "printers", "online"),
                PrinterTotal = ReadNestedInt(root, "printers", "total"),
            };
            snapshot.IsHealthy = snapshot.HealthScore >= 70;
            if (snapshot.PrinterOnline < 0) snapshot.PrinterOnline = 0;
            if (snapshot.PrinterTotal < 0) snapshot.PrinterTotal = 0;
            return snapshot;
        }

        private static string ReadNestedString(JsonElement root, string parent, string child)
        {
            if (root.TryGetProperty(parent, out var parentElement) && parentElement.ValueKind == JsonValueKind.Object && parentElement.TryGetProperty(child, out var childElement))
            {
                if (childElement.ValueKind == JsonValueKind.String) return childElement.GetString();
                if (childElement.ValueKind == JsonValueKind.True) return "true";
                if (childElement.ValueKind == JsonValueKind.False) return "false";
            }
            return null;
        }

        private static int ReadNestedInt(JsonElement root, string parent, string child)
        {
            if (root.TryGetProperty(parent, out var parentElement) && parentElement.ValueKind == JsonValueKind.Object && parentElement.TryGetProperty(child, out var childElement))
            {
                if (childElement.TryGetInt32(out var value)) return value;
                if (int.TryParse(childElement.ToString(), out value)) return value;
            }
            return -1;
        }
    }
}
