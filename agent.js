const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;

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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Adisyum POS Agent running at http://127.0.0.1:${PORT}`);
});
