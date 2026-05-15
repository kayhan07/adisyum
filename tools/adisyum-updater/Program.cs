using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace AdisyumUpdater
{
    internal static class Program
    {
        private static readonly CancellationTokenSource Shutdown = new CancellationTokenSource();
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };

        private static int Main(string[] args)
        {
            if (args.Contains("--once", StringComparer.OrdinalIgnoreCase))
            {
                return RunOnceAsync().GetAwaiter().GetResult();
            }

            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true;
                Shutdown.Cancel();
            };

            try
            {
                RunLoopAsync(Shutdown.Token).GetAwaiter().GetResult();
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }

        private static async Task RunLoopAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                await CheckForUpdatesAsync(token).ConfigureAwait(false);
                await Task.Delay(TimeSpan.FromMinutes(10), token).ConfigureAwait(false);
            }
        }

        private static async Task<int> RunOnceAsync()
        {
            var result = await CheckForUpdatesAsync(CancellationToken.None).ConfigureAwait(false);
            return result ? 0 : 2;
        }

        private static async Task<bool> CheckForUpdatesAsync(CancellationToken token)
        {
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Adisyum", "DesktopBridge");
            Directory.CreateDirectory(root);
            var manifestPath = Path.Combine(root, "release-manifest.json");
            var cacheRoot = Path.Combine(root, "updates");
            var stagingRoot = Path.Combine(root, "staging");
            var snapshotRoot = Path.Combine(root, "snapshots");
            Directory.CreateDirectory(cacheRoot);
            Directory.CreateDirectory(stagingRoot);
            Directory.CreateDirectory(snapshotRoot);

            var manifest = await LoadManifestAsync(manifestPath, token).ConfigureAwait(false);
            if (manifest == null)
            {
                ReleaseState.WriteHealth(root, "missing-manifest", "0.0.0", "stable", 0, false, "Update manifest missing");
                return false;
            }
            if (!ValidateChannel(manifest))
            {
                ReleaseState.WriteSecurityEvent(root, "suspicious-source", manifest.version, manifest.channel, "Release channel mismatch or tenant not eligible");
                return false;
            }
            if (!ValidateSignaturePolicy(manifest))
            {
                ReleaseState.WriteSecurityEvent(root, "failed-signature", manifest.version, manifest.channel, "Manifest signature missing or too short");
                return false;
            }
            if (!ValidateManifestDigest(manifest))
            {
                ReleaseState.WriteSecurityEvent(root, "corrupted-manifest", manifest.version, manifest.channel, "Manifest integrity digest mismatch");
                return false;
            }
            if (!ValidateGovernance(manifest))
            {
                ReleaseState.WriteSecurityEvent(root, "suspicious-source", manifest.version, manifest.channel, "Release governance approval missing");
                return false;
            }
            if (!IsInsideSafeUpdateWindow(manifest))
            {
                ReleaseState.WriteHealth(root, "deferred", manifest.version, manifest.channel, 0, false, "Outside safe update window");
                return true;
            }

            var installed = ReleaseState.Load(root);
            if (!IsNewer(manifest.version, installed.version))
            {
                ReleaseState.WriteHealth(root, "up-to-date", manifest.version, manifest.channel, 0, false, "No update needed");
                return true;
            }

            if (!manifest.downloadUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                ReleaseState.WriteSecurityEvent(root, "suspicious-source", manifest.version, manifest.channel, "Insecure download url rejected");
                return false;
            }

            var downloadPath = Path.Combine(cacheRoot, $"{manifest.version}.exe.partial");
            var finalPath = Path.Combine(cacheRoot, $"{manifest.version}.exe");
            var stopWatch = Stopwatch.StartNew();

            try
            {
                RecoverPartialDownload(downloadPath, finalPath);
                await DownloadAsync(manifest.downloadUrl, downloadPath, token).ConfigureAwait(false);
                VerifyChecksum(downloadPath, manifest.checksum);
                VerifySignature(downloadPath, manifest);
                File.Move(downloadPath, finalPath, true);

                var snapshotPath = ReleaseState.CreateSnapshot(snapshotRoot, installed, root);
                if (!StageUpdate(finalPath, stagingRoot, manifest.version, out var stageMessage))
                {
                    ReleaseState.RollbackToSnapshot(root, snapshotPath);
                    ReleaseState.WriteHealth(root, "rollback", manifest.version, manifest.channel, (int)stopWatch.ElapsedMilliseconds, true, stageMessage);
                    return false;
                }

                ReleaseState.MarkInstalled(root, manifest.version, manifest.channel, manifest.channel, manifest.downloadUrl, snapshotPath);
                ReleaseState.WriteHealth(root, "installed", manifest.version, manifest.channel, (int)stopWatch.ElapsedMilliseconds, false, "Update staged successfully");
                return true;
            }
            catch (Exception ex)
            {
                var errorStatus = MapErrorStatus(ex);
                ReleaseState.MarkFailure(root, manifest.version, manifest.channel, ex.Message, (int)stopWatch.ElapsedMilliseconds);
                ReleaseState.WriteHealth(root, errorStatus, manifest.version, manifest.channel, (int)stopWatch.ElapsedMilliseconds, false, ex.Message);
                if (errorStatus == "failed-signature" || errorStatus == "corrupted-package" || errorStatus == "corrupted-manifest")
                {
                    ReleaseState.WriteSecurityEvent(root, errorStatus, manifest.version, manifest.channel, ex.Message, (int)stopWatch.ElapsedMilliseconds);
                }
                if (File.Exists(downloadPath))
                {
                    try { File.Delete(downloadPath); } catch { }
                }
                return false;
            }
        }

        private static async Task<UpdateManifest> LoadManifestAsync(string path, CancellationToken token)
        {
            if (!File.Exists(path)) return null;
            var json = await File.ReadAllTextAsync(path, token).ConfigureAwait(false);
            var manifest = JsonSerializer.Deserialize<UpdateManifest>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return manifest;
        }

        private static bool ValidateChannel(UpdateManifest manifest)
        {
            var channel = (Environment.GetEnvironmentVariable("ADISYUM_RELEASE_CHANNEL") ?? "stable").Trim().ToLowerInvariant();
            var track = (manifest.track ?? manifest.channel ?? "stable").Trim().ToLowerInvariant();
            if (manifest.targetTenants != null && manifest.targetTenants.Length > 0)
            {
                return true;
            }
            return string.Equals(channel, track, StringComparison.OrdinalIgnoreCase) || string.Equals(channel, "hotfix", StringComparison.OrdinalIgnoreCase);
        }

        private static bool ValidateSignaturePolicy(UpdateManifest manifest)
        {
            return manifest.signedInstaller
                && manifest.signedBinaries
                && manifest.signedUpdater
                && !string.IsNullOrWhiteSpace(manifest.signature)
                && manifest.signature.Length >= 32
                && !string.IsNullOrWhiteSpace(manifest.publisher)
                && !string.IsNullOrWhiteSpace(manifest.publisherThumbprint)
                && !string.IsNullOrWhiteSpace(manifest.timestampServer);
        }

        private static bool ValidateManifestDigest(UpdateManifest manifest)
        {
            if (string.IsNullOrWhiteSpace(manifest.manifestDigest)) return false;
            var payload = string.Join("|", new[]
            {
                manifest.version,
                manifest.runtimeVersion,
                manifest.buildNumber,
                manifest.channel,
                manifest.track,
                manifest.downloadUrl,
                manifest.checksum,
                manifest.publisher,
                manifest.publisherThumbprint,
                manifest.timestampServer,
                manifest.signedInstaller.ToString(),
                manifest.signedBinaries.ToString(),
                manifest.signedUpdater.ToString(),
                manifest.stagedRolloutPercent.ToString(),
                manifest.minimumBridgeVersion,
                manifest.minimumTrayVersion,
                manifest.safeUpdateWindow,
                (manifest.releaseApproval?.required ?? false).ToString(),
                (manifest.releaseApproval?.approved ?? false).ToString(),
            });
            using var sha = SHA256.Create();
            var digest = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(payload))).Replace("-", string.Empty).ToLowerInvariant();
            return string.Equals(digest, manifest.manifestDigest.Replace("-", string.Empty).ToLowerInvariant(), StringComparison.OrdinalIgnoreCase);
        }

        private static bool ValidateGovernance(UpdateManifest manifest)
        {
            if (manifest.releaseApproval?.required == true && manifest.releaseApproval.approved != true) return false;
            if (manifest.pilotApproval?.required == true && manifest.pilotApproval.approved != true) return false;
            if (manifest.stagedRolloutApproval?.required == true && manifest.stagedRolloutApproval.approved != true) return false;
            if (manifest.stagedRolloutPercent < 0 || manifest.stagedRolloutPercent > 100) return false;
            return true;
        }

        private static bool IsInsideSafeUpdateWindow(UpdateManifest manifest)
        {
            if (string.Equals(manifest.channel, "hotfix", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.IsNullOrWhiteSpace(manifest.safeUpdateWindow)) return true;
            var parts = manifest.safeUpdateWindow.Split('-');
            if (parts.Length != 2) return true;
            if (!TimeSpan.TryParse(parts[0], out var start)) return true;
            if (!TimeSpan.TryParse(parts[1], out var end)) return true;
            var now = DateTime.Now.TimeOfDay;
            if (start <= end) return now >= start && now <= end;
            return now >= start || now <= end;
        }

        private static async Task DownloadAsync(string url, string path, CancellationToken token)
        {
            using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            await using var input = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
            await using var output = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None);
            await input.CopyToAsync(output, 81920, token).ConfigureAwait(false);
        }

        private static void VerifyChecksum(string path, string expected)
        {
            if (string.IsNullOrWhiteSpace(expected)) throw new InvalidOperationException("Checksum missing");
            var normalized = expected.Replace("sha256:", string.Empty, StringComparison.OrdinalIgnoreCase).Trim();
            using var sha = SHA256.Create();
            using var stream = File.OpenRead(path);
            var actual = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", string.Empty).ToLowerInvariant();
            if (!string.Equals(actual, normalized.Replace("-", string.Empty).ToLowerInvariant(), StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Checksum mismatch");
            }
        }

        private static void RecoverPartialDownload(string partialPath, string finalPath)
        {
            if (File.Exists(partialPath))
            {
                var age = DateTimeOffset.UtcNow - File.GetLastWriteTimeUtc(partialPath);
                if (age > TimeSpan.FromMinutes(30)) File.Delete(partialPath);
            }
            if (File.Exists(finalPath))
            {
                File.Delete(finalPath);
            }
        }

        private static void VerifySignature(string path, UpdateManifest manifest)
        {
            if (string.IsNullOrWhiteSpace(manifest.signature)) throw new InvalidOperationException("Signature missing");
            var bytes = File.ReadAllBytes(path);
            var signatureBytes = Convert.FromBase64String(manifest.signature);
            if (signatureBytes.Length < 32) throw new InvalidOperationException("Signature invalid");
            if (bytes.Length == 0) throw new InvalidOperationException("Downloaded file empty");

            try
            {
                var certificate = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
                var actualThumbprint = (certificate.Thumbprint ?? string.Empty).Replace(" ", string.Empty);
                var expectedThumbprint = (manifest.publisherThumbprint ?? string.Empty).Replace(" ", string.Empty);
                if (!string.Equals(actualThumbprint, expectedThumbprint, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("Publisher thumbprint mismatch");
                }

                using var chain = new X509Chain();
                chain.ChainPolicy.RevocationMode = X509RevocationMode.Online;
                chain.ChainPolicy.RevocationFlag = X509RevocationFlag.ExcludeRoot;
                if (!chain.Build(certificate))
                {
                    throw new InvalidOperationException("Authenticode certificate chain invalid");
                }
            }
            catch (CryptographicException ex)
            {
                throw new InvalidOperationException("Authenticode signature invalid: " + ex.Message);
            }
        }

        private static string MapErrorStatus(Exception ex)
        {
            var message = (ex?.Message ?? string.Empty).ToLowerInvariant();
            if (message.Contains("checksum")) return "corrupted-package";
            if (message.Contains("signature")) return "failed-signature";
            if (message.Contains("download")) return "download-failed";
            if (message.Contains("manifest")) return "corrupted-manifest";
            return "failed";
        }

        private static bool IsNewer(string target, string current)
        {
            Version.TryParse((target ?? string.Empty).TrimStart('v'), out var targetVersion);
            Version.TryParse((current ?? string.Empty).TrimStart('v'), out var currentVersion);
            if (targetVersion == null) return false;
            if (currentVersion == null) return true;
            return targetVersion > currentVersion;
        }

        private static bool StageUpdate(string installerPath, string stagingRoot, string version, out string message)
        {
            try
            {
                var stageDir = Path.Combine(stagingRoot, version);
                Directory.CreateDirectory(stageDir);
                var stagedInstaller = Path.Combine(stageDir, Path.GetFileName(installerPath));
                File.Copy(installerPath, stagedInstaller, true);
                message = "staged";
                return true;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return false;
            }
        }
    }

    internal sealed class UpdateManifest
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
        public string manifestDigest { get; set; }
        public decimal stagedRolloutPercent { get; set; }
        public string minimumBridgeVersion { get; set; }
        public string minimumTrayVersion { get; set; }
        public string[] targetTenants { get; set; }
        public string publisher { get; set; }
        public string publisherThumbprint { get; set; }
        public string timestampServer { get; set; }
        public bool signedInstaller { get; set; }
        public bool signedBinaries { get; set; }
        public bool signedUpdater { get; set; }
        public string safeUpdateWindow { get; set; }
        public bool tenantSafeRollout { get; set; }
        public bool rollbackSnapshot { get; set; }
        public bool partialDownloadRecovery { get; set; }
        public ReleaseApproval releaseApproval { get; set; }
        public ReleaseApproval pilotApproval { get; set; }
        public ReleaseApproval stagedRolloutApproval { get; set; }
    }

    internal sealed class ReleaseApproval
    {
        public bool required { get; set; }
        public bool approved { get; set; }
        public string approvedBy { get; set; }
        public string approvedAt { get; set; }
    }

    internal sealed class ReleaseState
    {
        public string version { get; set; }
        public string channel { get; set; }
        public string track { get; set; }
        public string downloadUrl { get; set; }
        public string snapshotPath { get; set; }
        public string lastStatus { get; set; }
        public string lastError { get; set; }
        public int lastLatencyMs { get; set; }
        public DateTimeOffset updatedAt { get; set; }

        public static ReleaseState Load(string root)
        {
            var path = Path.Combine(root, "release-state.json");
            if (!File.Exists(path))
            {
                return new ReleaseState { version = "0.0.0", channel = "stable", track = "stable", updatedAt = DateTimeOffset.UtcNow };
            }

            try
            {
                return JsonSerializer.Deserialize<ReleaseState>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new ReleaseState { version = "0.0.0" };
            }
            catch
            {
                return new ReleaseState { version = "0.0.0", channel = "stable", track = "stable", updatedAt = DateTimeOffset.UtcNow };
            }
        }

        public static void MarkInstalled(string root, string version, string channel, string track, string downloadUrl, string snapshotPath)
        {
            var state = new ReleaseState
            {
                version = version,
                channel = channel,
                track = track,
                downloadUrl = downloadUrl,
                snapshotPath = snapshotPath,
                lastStatus = "installed",
                updatedAt = DateTimeOffset.UtcNow,
            };
            Write(root, state);
        }

        public static void MarkFailure(string root, string version, string channel, string error, int latencyMs)
        {
            var state = Load(root);
            state.version = version ?? state.version;
            state.channel = channel ?? state.channel;
            state.lastStatus = state.lastStatus == "blocked" ? state.lastStatus : "failed";
            state.lastError = error;
            state.lastLatencyMs = latencyMs;
            state.updatedAt = DateTimeOffset.UtcNow;
            Write(root, state);
        }

        public static void WriteHealth(string root, string status, string version, string channel, int latencyMs, bool rollback, string message)
        {
            var state = Load(root);
            state.version = version ?? state.version;
            state.channel = channel ?? state.channel;
            state.lastStatus = rollback ? "rollback" : status;
            state.lastError = message;
            state.lastLatencyMs = latencyMs;
            state.updatedAt = DateTimeOffset.UtcNow;
            Write(root, state);
        }

        public static void WriteSecurityEvent(string root, string status, string version, string channel, string message, int latencyMs = 0)
        {
            WriteHealth(root, status, version, channel, latencyMs, false, message);
        }

        public static string CreateSnapshot(string snapshotRoot, ReleaseState installed, string root)
        {
            var snapshotPath = Path.Combine(snapshotRoot, DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmss"));
            Directory.CreateDirectory(snapshotPath);
            var payload = JsonSerializer.Serialize(installed, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(Path.Combine(snapshotPath, "release-state.json"), payload);
            return snapshotPath;
        }

        public static void RollbackToSnapshot(string root, string snapshotPath)
        {
            var file = Path.Combine(snapshotPath ?? string.Empty, "release-state.json");
            if (!File.Exists(file)) return;
            try
            {
                File.Copy(file, Path.Combine(root, "release-state.json"), true);
            }
            catch
            {
                // best effort
            }
        }

        private static void Write(string root, ReleaseState state)
        {
            var path = Path.Combine(root, "release-state.json");
            File.WriteAllText(path, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        }
    }
}
