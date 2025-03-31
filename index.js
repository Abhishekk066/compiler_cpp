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
var currentCode;
var filename;

const mainDomain = 'https://compiler-cpp06.onrender.com';
const requestedDomain = 'https://file-manager-cpp06.onrender.com';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({ origin: requestedDomain }));

const codeCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

app.use(
  '/codemirror',
  express.static(path.join(__dirname, 'node_modules/codemirror')),
);

app.post('/generate-url', async (req, res) => {
  const { code, filename } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const data = { message: true, type: 'default', filename, code };
  const codeId = crypto.randomUUID();
  codeCache.set(codeId, data);
  const route = `/share/${codeId}`;
  app.use(
    `${route}/codemirror`,
    express.static(path.join(__dirname, 'node_modules/codemirror')),
  );
  app.use(route, express.static(path.join(__dirname, 'editor')));
  const url = `${mainDomain}${route}`;
  res.status(200).json({ message: true, url });
});

app.post('/generate-qrcode', async (req, res) => {
  try {
    const { code, filename } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    const url = await QRCode.toDataURL(code);
    QRCode.toFile('qrcode.png', code)
      .then(() => console.log('QR Code saved as qrcode.png'))
      .catch(console.error);
    res.send(url);
  } catch (err) {
    const error = await QRCode.toDataURL('not found');
    res.status(500).send(error);
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
    console.error('Fetch error:', error);
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

// 🔹 API to Fetch Default Code
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
    console.error('Fetch error:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch code from external service' });
  }
});

app.post('/get-theme', (req, res) => {
  const { themeMode } = req.body;
  console.log(themeMode);

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

// 🔹 WebSocket Handler for Compilation and Execution
wss.on('connection', (ws) => {
  console.log('Client connected');
  const clientId = crypto.randomUUID();
  let sourceFile = path.join(__dirname, `code_${clientId}.cpp`);
  let outputFile = path.join(__dirname, `code_${clientId}.exe`);
  let cppProcess = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'code') {
        if (cppProcess) {
          cppProcess.kill();
          cppProcess = null;
        }

        await fs.writeFile(sourceFile, data.code);
        console.log(`Code received from ${clientId}. Compiling...`);

        await deleteFileIfExists(outputFile);

        const compile = spawn('g++', [sourceFile, '-o', outputFile]);
        let compileError = '';

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

          ws.send(JSON.stringify({ type: 'running', message: 'Running...' }));

          cppProcess.stdout.on('data', (output) => {
            ws.send(
              JSON.stringify({ type: 'output', message: output.toString() }),
            );

            if (output.toString().includes('Enter')) {
              ws.send(JSON.stringify({ type: 'input-request' }));
            }
          });

          cppProcess.stderr.on('data', (error) => {
            ws.send(
              JSON.stringify({ type: 'error', message: error.toString() }),
            );
          });

          cppProcess.on('close', () => {
            ws.send(
              JSON.stringify({
                type: 'finished',
                message: 'Execution Finished.',
              }),
            );
          });
        });
      } else if (data.type === 'input' && cppProcess) {
        cppProcess.stdin.write(data.input + '\n');
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(
        JSON.stringify({ type: 'error', message: 'Internal Server Error' }),
      );
    }
  });

  ws.on('close', async () => {
    if (cppProcess) cppProcess.kill();
    console.log(`Client ${clientId} disconnected`);

    await deleteFileIfExists(sourceFile);
    await deleteFileIfExists(outputFile);
  });
});

process.on('SIGINT', async () => {
  console.log('Shutting down, cleaning up...');

  const files = await fs.readdir(__dirname);
  for (const file of files) {
    if (
      file.startsWith('code_') &&
      (file.endsWith('.cpp') || file.endsWith('.exe'))
    ) {
      await deleteFileIfExists(path.join(__dirname, file));
    }
  }

  console.log('Cleanup complete. Exiting.');
  process.exit();
});

/**
 * @param {string} filePath
 */
async function deleteFileIfExists(filePath) {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    console.log(`Deleted: ${filePath}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error deleting ${filePath}:`, err);
    }
  }
}

server.listen(10000, () => {
  console.log('server is running on https://compiler-cpp.onrender.com');
});
