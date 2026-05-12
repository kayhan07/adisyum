const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const HTTP_PORT = Number(process.env.PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);

app.use(express.json({ limit: '2mb' }));

// Manual CORS + PNA (Private Network Access) handling
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // CRITICAL: Always set PNA header for loopback addresses, especially for OPTIONS preflight
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  
  // Handle OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.get('/printers', (req, res) => {
  exec(
    'powershell -Command "Get-Printer | Select-Object Name | ConvertTo-Json"',
    (error, stdout) => {
      if (error) return res.status(500).send(error.message || String(error));

      try {
        const data = JSON.parse(stdout);
        const printers = Array.isArray(data)
          ? data.map((p) => p.Name).filter(Boolean)
          : [data.Name].filter(Boolean);

        res.json(printers);
      } catch {
        res.status(500).send('Parse error');
      }
    },
  );
});

app.post('/print', (req, res) => {
  const printerName = typeof req.body?.printerName === 'string' ? req.body.printerName.trim() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text : '';

  if (!printerName || !text) {
    return res.status(400).json({ error: 'printerName ve text zorunlu.' });
  }

  return res.json({ success: true, printerName, queued: true });
});

app.listen(HTTP_PORT, () => {
  console.log(`Adisyum POS Agent HTTP running at http://127.0.0.1:${HTTP_PORT} and http://localhost:${HTTP_PORT}`);
});

// HTTPS support using PFX certificate (created by PowerShell)
const pfxPath = process.env.AGENT_TLS_PFX || path.join(__dirname, 'certs', 'localhost.pfx');
const pfxPassword = process.env.AGENT_TLS_PFX_PASSWORD || 'adisyum';

if (fs.existsSync(pfxPath)) {
  try {
    const pfxData = fs.readFileSync(pfxPath);
    // PFX can be used directly with https.createServer in Node.js if password provided
    // However, modern Node.js prefers PEM format. For now, use pfx option:
    https.createServer({ 
      pfx: pfxData,
      passphrase: pfxPassword
    }, app).listen(HTTPS_PORT, () => {
      console.log(`Adisyum POS Agent HTTPS running at https://localhost:${HTTPS_PORT}`);
    });
  } catch (err) {
    console.log('HTTPS initialization failed:', err.message);
    console.log('Continuing with HTTP only mode...');
  }
} else {
  console.log(`Note: HTTPS not available. PFX file not found at: ${pfxPath}`);
}
