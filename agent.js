const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const HTTP_PORT = Number(process.env.PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

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

app.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`Adisyum POS Agent HTTP running at http://127.0.0.1:${HTTP_PORT}`);
});

const certPath = process.env.AGENT_TLS_CERT || path.join(__dirname, 'certs', 'localhost.crt');
const keyPath = process.env.AGENT_TLS_KEY || path.join(__dirname, 'certs', 'localhost.key');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);

  https.createServer({ key, cert }, app).listen(HTTPS_PORT, '127.0.0.1', () => {
    console.log(`Adisyum POS Agent HTTPS running at https://127.0.0.1:${HTTPS_PORT}`);
  });
} else {
  console.log('HTTPS disabled: certificate files not found.');
  console.log(`To enable HTTPS place certs at: ${certPath} and ${keyPath}`);
}
