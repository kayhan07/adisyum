# Windows Printer Bridge Recovery Report

## Scope

Recovery freeze change focused only on local Windows printer discovery, desktop diagnostics, local bridge payload compatibility, and cloud proxy metadata preservation.

## Findings

| Area | Status | Finding | Fix |
| --- | --- | --- | --- |
| C# bridge printer discovery | Fixed | Packaged Windows bridge used only `Get-Printer` and returned names only. If that call failed, discovery degraded sharply. | Added multi-method discovery through `Get-Printer`, `Get-CimInstance Win32_Printer`, and `Get-WmiObject Win32_Printer`; added dedupe, metadata, cache fallback, and visible logs. |
| C# `/printers` response | Fixed | Desktop/cloud could not see driver, port, default, online/offline, shared, or ESC/POS hints. | `/printers` now returns detailed printer inventory objects while existing name consumers still work through normalization. |
| JS local agent fallback | Fixed | Legacy JS agent used a single `Get-Printer` name-only path and returned 500 on discovery failure. | Added the same fallback chain, spooler diagnostics, local cache, `/health` inventory, and print-target preflight warnings. |
| Desktop test print | Fixed | Desktop test action sent `text/ticketType`, but the local bridge expects RAW `bytesBase64`. | Desktop test print now sends a RAW ESC/POS test receipt payload. |
| Settings printer scan | Fixed | Local printer scan collapsed every discovered printer to USB-only names. | Preserves driver, port, status, shared flag, IP, and network/USB classification where available. |
| Diagnostic panel | Fixed | Printer list did not expose type/status/default/ESC-POS hints and test results were invisible. | Shows printer metadata and writes test print result to the support panel. |

## Live QA Still Required

These require a real Windows machine or clean Windows VM with physical or shared printers:

- USB thermal printer discovery
- Network printer discovery
- Windows shared printer discovery
- Offline printer visibility
- USB reconnect refresh
- Windows restart service recovery
- Test print against ESC/POS device
- Tenant printer mapping verification after reconnect

## Validation

- `node --check agent.js`
- `node --check apps/desktop/src/main.cjs`
- `node --check apps/desktop/src/renderer/renderer.js`
- `dotnet build tools/adisyum-pos-agent/AdisyumPosAgent.csproj`
- `dotnet build tools/agent-installer/AdisyumPosAgentInstaller.csproj`
- `npx tsc --noEmit`
- `npm run build`
- `npm run routes`
- `npm run runtime11`
- `npm run adisyum`
- `npm run product`
