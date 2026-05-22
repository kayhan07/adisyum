# Device Runtime Ownership

`lib/device-runtime/device-session-registry.ts` is the canonical device, printer, bridge, and fiscal ownership boundary.

## Responsibilities

The device session registry owns:

- runtime device id resolution
- printer device registration projection
- printer route resolution
- bridge print dispatch
- bridge printer discovery
- device handshake authorization

## Browser Device Identity

`resolveRuntimeDeviceId` owns the browser runtime device id. UI providers may request the id, but must not directly read or write the device identity storage key.

## Bridge Rules

Browser localhost bridge calls must be gated by desktop runtime detection or explicit enablement.

Production web must use the root app proxy routes for local-agent operations:

- `/api/printers/local-agent`
- `/api/printers/local-agent/print`

The proxy calls are routed through `runtimeFetch`, so credentials and API namespace rules remain deterministic.
