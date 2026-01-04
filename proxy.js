require("dotenv").config();

const express = require("express");

const aws4 = require("aws4");
const { URL } = require("url");

const app = express();

// Need to save body as bytes/string so the signature is calculated on the same body
app.use(express.raw({ type: "*/*", limit: "20mb" }));

const YDB_ENDPOINT = process.env.YDB_ENDPOINT; // full https://docapi.../ru-central1/...
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "ru-central1";

if (!YDB_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("Set env: YDB_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
}

const targetBase = new URL(YDB_ENDPOINT);

function pickHeaders(req) {
    // Transfer only necessary headers; we'll set host/authorization/x-amz-date ourselves
    const out = {};
    for (const [k, v] of Object.entries(req.headers)) {
        const key = k.toLowerCase();
        if (
            key === "host" ||
            key === "authorization" ||
            key === "x-amz-date" ||
            key === "x-amz-content-sha256" ||
            key === "content-length"
        ) continue;

        // DynamoDB API requires these headers:
        if (key === "content-type" || key === "x-amz-target" || key.startsWith("x-amz-")) {
            out[key] = v;
        }
    }
    return out;
}

app.use(async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`\n[${ new Date().toISOString()}] [${requestId}] ========== NEW REQUEST ==========`);
    console.log(`[${requestId}] Method: ${req.method}`);
    console.log(`[${requestId}] Original URL: ${req.originalUrl}`);
    console.log(`[${requestId}] Headers:`, JSON.stringify(req.headers, null, 2));

    try {
        const bodyBuf = req.body && req.body.length ? req.body : Buffer.alloc(0);
        console.log(`[${requestId}] Body length: ${bodyBuf.length} bytes`);
        if (bodyBuf.length > 0 && bodyBuf.length < 1000) {
            console.log(`[${requestId}] Body content:`, bodyBuf.toString('utf8'));
        }

        // Build URL: base(YDB endpoint) + request path (+ query)
        // Save base path from YDB_ENDPOINT and add request path
        const requestUrl = new URL(req.originalUrl, 'http://dummy');
        const url = new URL(targetBase.toString());
        // If request has a path (not just /), add it to the base
        if (requestUrl.pathname !== '/') {
            url.pathname = targetBase.pathname + requestUrl.pathname;
        }
        url.search = requestUrl.search;

        const headers = pickHeaders(req);
        console.log(`[${requestId}] Picked headers for signing:`, JSON.stringify(headers, null, 2));

        // aws4 expects host/path, and body as string/buffer
        const signOpts = {
            host: url.host,
            method: req.method,
            path: url.pathname + url.search,
            service: "dynamodb",
            region: AWS_REGION,
            headers,
            body: bodyBuf.length ? bodyBuf : undefined,
        };

        console.log(`[${requestId}] Target URL: ${url.toString()}`);
        console.log(`[${requestId}] AWS Region: ${AWS_REGION}`);
        console.log(`[${requestId}] Signing request with AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID.substring(0, 10)}...`);

        aws4.sign(signOpts, {
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
        });

        console.log(`[${requestId}] Signed headers:`, JSON.stringify(signOpts.headers, null, 2));

        // aws4 will add Authorization + X-Amz-Date (+ possibly x-amz-content-sha256)
        const upstreamHeaders = signOpts.headers;

        console.log(`[${requestId}] Sending request to upstream...`);
        const upstreamResp = await fetch(url.toString(), {
            method: req.method,
            headers: upstreamHeaders,
            body: bodyBuf.length ? bodyBuf : undefined,
        });

        console.log(`[${requestId}] Upstream response status: ${upstreamResp.status} ${upstreamResp.statusText}`);
        const responseHeaders = {};
        upstreamResp.headers.forEach((v, k) => {
            responseHeaders[k] = v;
        });
        console.log(`[${requestId}] Upstream response headers:`, JSON.stringify(responseHeaders, null, 2));

        // Pass through status/headers/body back to the client
        res.status(upstreamResp.status);
        upstreamResp.headers.forEach((v, k) => {
            // some hop-by-hop headers are better not to pass through
            if (k.toLowerCase() === "transfer-encoding") return;
            res.setHeader(k, v);
        });

        const respBuf = Buffer.from(await upstreamResp.arrayBuffer());
        console.log(`[${requestId}] Response body length: ${respBuf.length} bytes`);
        if (respBuf.length > 0 && respBuf.length < 1000) {
            console.log(`[${requestId}] Response body:`, respBuf.toString('utf8'));
        }
        console.log(`[${requestId}] ========== REQUEST COMPLETE ==========\n`);
        res.send(respBuf);
    } catch (e) {
        console.error(`[${requestId}] ========== ERROR ==========`);
        console.error(`[${requestId}] Error message:`, e.message);
        console.error(`[${requestId}] Error stack:`, e.stack);
        console.error(`[${requestId}] ========== ERROR END ==========\n`);
        res.status(502).json({ error: String(e && e.message ? e.message : e) });
    }
});

const port = Number(process.env.PORT || 8000);
app.listen(port, () => {
    console.log(`\n========== YDB PROXY SERVER STARTED ==========`);
    console.log(`Server listening on: http://127.0.0.1:${port}`);
    console.log(`Target endpoint: ${YDB_ENDPOINT}`);
    console.log(`AWS Region: ${AWS_REGION}`);
    console.log(`AWS Access Key ID: ${AWS_ACCESS_KEY_ID.substring(0, 10)}...`);
    console.log(`Debug logging: ENABLED`);
    console.log(`==============================================\n`);
});
