const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { URL } = require('url');

const HOST = '127.0.0.1';
const PORT = 3000;
const ROOT_DIR = __dirname;
const ADD_FILE = path.join(ROOT_DIR, 'add.txt');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': MIME_TYPES['.json'],
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(body);
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new Error('Request body too large.'));
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function serveStaticFile(reqPath, res) {
    const safePath = reqPath === '/' ? 'index.html' : decodeURIComponent(reqPath).replace(/^\/+/, '');
    const filePath = path.resolve(ROOT_DIR, safePath);
    const normalizedRoot = path.resolve(ROOT_DIR);
    const normalizedFile = path.resolve(filePath);

    if (!normalizedFile.startsWith(normalizedRoot)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
    }

    fs.readFile(normalizedFile, (err, data) => {
        if (err) {
            sendJson(res, 404, { error: 'File not found' });
            return;
        }
        const ext = path.extname(normalizedFile).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

async function handleAppend(req, res) {
    try {
        const body = await readRequestBody(req);
        const parsed = JSON.parse(body || '{}');
        const value = Number(parsed.value);
        if (!Number.isFinite(value)) {
            sendJson(res, 400, { error: 'Invalid value' });
            return;
        }

        await fs.promises.appendFile(ADD_FILE, `${value}\n`, 'utf8');
        sendJson(res, 200, { ok: true });
    } catch (error) {
        sendJson(res, 500, { error: 'Failed to append add.txt' });
    }
}

async function handleWriteAll(req, res) {
    try {
        const body = await readRequestBody(req);
        const parsed = JSON.parse(body || '{}');
        if (!Array.isArray(parsed.numbers)) {
            sendJson(res, 400, { error: 'Invalid numbers' });
            return;
        }

        const sanitized = [];
        for (const item of parsed.numbers) {
            const value = Number(item);
            if (!Number.isFinite(value)) {
                sendJson(res, 400, { error: 'Invalid number item' });
                return;
            }
            sanitized.push(value);
        }

        const content = sanitized.length > 0 ? `${sanitized.join('\n')}\n` : '';
        await fs.promises.writeFile(ADD_FILE, content, 'utf8');
        sendJson(res, 200, { ok: true });
    } catch (error) {
        sendJson(res, 500, { error: 'Failed to write add.txt' });
    }
}

async function handleOpenAddFile(res) {
    try {
        await fs.promises.appendFile(ADD_FILE, '', 'utf8');
        const escapedPath = ADD_FILE.replace(/"/g, '""');
        exec(`start "" "${escapedPath}"`);
        sendJson(res, 200, { ok: true });
    } catch (error) {
        sendJson(res, 500, { error: 'Failed to open add.txt' });
    }
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/append') {
        await handleAppend(req, res);
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/open-add-file') {
        await handleOpenAddFile(res);
        return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/write-all') {
        await handleWriteAll(req, res);
        return;
    }

    if (req.method === 'GET') {
        serveStaticFile(parsedUrl.pathname, res);
        return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, HOST, () => {
    console.log(`累加器已启动: http://${HOST}:${PORT}`);
    console.log(`add.txt 文件路径: ${ADD_FILE}`);
});
