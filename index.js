import { spawn } from 'child_process';
import cors from 'cors';
import crypto from 'crypto';
import EventEmitter from 'events';
import express from 'express';
import fs from 'fs/promises';
import http from 'http';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import path from 'path';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
EventEmitter.defaultMaxListeners = 60;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const mainDomain = 'https://compilercpp.onrender.com';
const requestedDomain = 'https://fecpp.onrender.com';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

const codeCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

app.use(
  '/codemirror',
  express.static(path.join(__dirname, 'node_modules/codemirror')),
);

app.post('/generate-url', async (req, res) => {
  const { code, filename } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const host = req.get('host');
  const data = { message: true, type: 'default', filename, code };
  const codeId = crypto.randomUUID();
  codeCache.set(codeId, data);
  const route = `/share/${codeId}`;
  app.use(
    `${route}/codemirror`,
    express.static(path.join(__dirname, 'node_modules/codemirror')),
  );
  app.use(route, express.static(path.join(__dirname, 'editor')));
  const url = `https://${host}${route}`;
  res.status(200).json({ message: true, url });
});

app.post('/generate-qrcode', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const qrcodeUrl = await QRCode.toDataURL(url, {
      margin: 2,
    });
    res.type('image/png').send(qrcodeUrl);
  } catch (err) {
    const fallback = await QRCode.toDataURL('not found', { margin: 2 });
    res.status(500).type('image/png').send(fallback);
  }
});

async function sendUrl(req, res) {
  const fetchUrl = `${requestedDomain}/send-code`;
  try {
    const response = await fetch(fetchUrl, { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const data = await response.json();

    if (!data.message) return res.status(404).json({ message: false });

    const codeId = crypto.randomUUID();
    codeCache.set(codeId, data);
    const route = `/c/${codeId}`;
    app.use(
      `${route}/codemirror`,
      express.static(path.join(__dirname, 'node_modules/codemirror')),
    );
    app.use(route, express.static(path.join(__dirname, 'editor')));
    const url = `${mainDomain}${route}`;
    res.status(200).json({ message: true, url });
  } catch (error) {
    return res
      .status(500)
      .json({ error: 'Failed to fetch code from external service' });
  }
}

app.post('/send-url', sendUrl);

app.post('/code/c/:id', (req, res) => {
  const codeId = req.params.id;
  let code = codeCache.get(codeId);

  if (!code) {
    return res
      .status(404)
      .send('<script>window.location.replace(' / ');</script>');
  }

  res.send(code);
});

app.post('/code/share/:id', (req, res) => {
  const codeId = req.params.id;
  let code = codeCache.get(codeId);

  if (!code) {
    return res
      .status(404)
      .send("<script>window.location.replace('/');</script>");
  }

  res.send(code);
});

app.post('/default-code', async (req, res) => {
  try {
    res.json({
      type: 'default',
      filename: 'main.cpp',
      code: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, Abhishek";
    return 0;
}`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: 'Failed to fetch code from external service' });
  }
});

app.post('/get-theme', (req, res) => {
  const { themeMode } = req.body;
  if (themeMode === 'light') {
    app.get('/redirect-day', (req, res) => {
      res.sendFile(path.join(__dirname, '404_day.html'));
    });
  } else {
    app.get('/redirect-night', (req, res) => {
      res.sendFile(path.join(__dirname, '404.html'));
    });
  }

  res.json({ message: true, themeMode });
});

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  let sourceFile = path.join(__dirname, `code_${clientId}.cpp`);
  let outputFile = path.join(__dirname, `code_${clientId}.exe`);
  let cppProcess = null;

  let hasCinStatements = false;
  let executionStartTime = null;
  let waitingForInput = false;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'code') {
        if (cppProcess) {
          cppProcess.kill();
          cppProcess = null;
        }

        await fs.writeFile(sourceFile, data.code);
        await deleteFileIfExists(outputFile);

        const compile = spawn('g++', [sourceFile, '-o', outputFile]);
        let compileError = '';

        const cinRegex = /cin\s*>>/g;
        const getlineRegex = /getline\s*\(\s*cin/g;
        hasCinStatements =
          cinRegex.test(data.code) || getlineRegex.test(data.code);

        waitingForInput = false;

        compile.stderr.on('data', (error) => {
          compileError += error.toString();
        });

        compile.on('close', async (code) => {
          if (code !== 0) {
            ws.send(JSON.stringify({ type: 'error', message: compileError }));
            return;
          }

          ws.send(
            JSON.stringify({
              type: 'compiled',
              message: 'Compiled Successfully!',
            }),
          );

          cppProcess = spawn(outputFile);
          executionStartTime = performance.now();

          ws.send(JSON.stringify({ type: 'running', message: 'Running...' }));

          if (hasCinStatements) {
            setTimeout(() => {
              if (cppProcess && ws.readyState === ws.OPEN && !waitingForInput) {
                waitingForInput = true;
                ws.send(JSON.stringify({ type: 'input-request' }));
              }
            }, 100);
          }

          cppProcess.stdout.on('data', (output) => {
            ws.send(
              JSON.stringify({ type: 'output', message: output.toString() }),
            );

            if (hasCinStatements && cppProcess && !waitingForInput) {
              setTimeout(() => {
                if (
                  cppProcess &&
                  ws.readyState === ws.OPEN &&
                  !waitingForInput
                ) {
                  waitingForInput = true;
                  ws.send(JSON.stringify({ type: 'input-request' }));
                }
              }, 50);
            }
          });

          cppProcess.stderr.on('data', (error) => {
            ws.send(
              JSON.stringify({ type: 'error', message: error.toString() }),
            );
          });

          cppProcess.on('close', (exitCode) => {
            cppProcess = null;
            waitingForInput = false;

            const executionTime = executionStartTime
              ? ((performance.now() - executionStartTime) / 1000).toFixed(2)
              : '0.00';

            if (exitCode !== null && ws.readyState === ws.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'finished',
                  timer: executionTime,
                  message: 'Execution Finished.',
                }),
              );
            }
          });
        });
      } else if (data.type === 'input' && cppProcess) {
        cppProcess.stdin.write(data.input + '\n');
        waitingForInput = false;
      }
    } catch (err) {
      console.error('Error:', err);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({ type: 'error', message: 'Internal Server Error' }),
        );
      }
    }
  });

  ws.on('close', async () => {
    if (cppProcess) {
      cppProcess.kill();
      cppProcess = null;
    }
    await deleteFileIfExists(sourceFile);
    await deleteFileIfExists(outputFile);
  });
});

process.on('SIGINT', async () => {
  const files = await fs.readdir(__dirname);
  for (const file of files) {
    if (
      file.startsWith('code_') &&
      (file.endsWith('.cpp') || file.endsWith('.exe'))
    ) {
      await deleteFileIfExists(path.join(__dirname, file));
    }
  }

  process.exit();
});

/**
 * @param {string} filePath
 */
async function deleteFileIfExists(filePath) {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error deleting ${filePath}:`, err);
    }
  }
}

server.listen(10000);
