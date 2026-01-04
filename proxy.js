const path = require("path");

// Load config from CLI argument or default .env
const configName = process.argv[2];
const configPath = configName ? `.env.${configName}` : '.env';
require("dotenv").config({ path: configPath });

const express = require("express");
const aws4 = require("aws4");
const { URL } = require("url");

const app = express();

// Need to save body as bytes/string so the signature is calculated on the same body
app.use(express.raw({ type: "*/*", limit: "20mb" }));

// Configuration
const YDB_ENDPOINT = process.env.YDB_ENDPOINT;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "ru-central1";
const PORT = Number(process.env.PORT || 8000);

if (!YDB_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error(`\nError: Missing required environment variables in ${configPath}`);
    console.error("Required: YDB_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY\n");
    process.exit(1);
}

const targetBase = new URL(YDB_ENDPOINT);

/**
 * Creates a logger instance with request ID prefix
 * @param {string} requestId - Unique request identifier
 * @returns {{info: Function, error: Function}} Logger instance
 */
function createLogger(requestId) {
    const prefix = `[${requestId}]`;
    return {
        info: (msg, data) => {
            if (data !== undefined) {
                console.log(`${prefix} ${msg}`, data);
            } else {
                console.log(`${prefix} ${msg}`);
            }
        },
        error: (msg, data) => {
            if (data !== undefined) {
                console.error(`${prefix} ${msg}`, data);
            } else {
                console.error(`${prefix} ${msg}`);
            }
        }
    };
}

/**
 * Filters request headers for AWS signing
 * Keeps only DynamoDB API required headers, excludes auth headers that will be generated
 * @param {object} req - Express request object
 * @returns {object} Filtered headers object
 */
function pickHeaders(req) {
    const out = {};
    for (const [k, v] of Object.entries(req.headers)) {
        const key = k.toLowerCase();

        // Skip headers that we'll set ourselves
        if (["host", "authorization", "x-amz-date", "x-amz-content-sha256", "content-length"].includes(key)) {
            continue;
        }

        // DynamoDB API requires these headers
        if (key === "content-type" || key === "x-amz-target" || key.startsWith("x-amz-")) {
            out[key] = v;
        }
    }
    return out;
}

/**
 * Builds target URL by combining YDB endpoint with request path
 * @param {object} req - Express request object
 * @param {URL} targetBase - Base YDB endpoint URL
 * @returns {URL} Complete target URL with path and query
 */
function buildTargetUrl(req, targetBase) {
    const requestUrl = new URL(req.originalUrl, 'http://dummy');
    const url = new URL(targetBase.toString());

    // If request has a path (not just /), add it to the base
    if (requestUrl.pathname !== '/') {
        url.pathname = targetBase.pathname + requestUrl.pathname;
    }
    url.search = requestUrl.search;

    return url;
}

/**
 * Signs request with AWS Signature Version 4 for DynamoDB service
 * @param {URL} url - Target URL
 * @param {string} method - HTTP method
 * @param {object} headers - Request headers
 * @param {Buffer} bodyBuf - Request body buffer
 * @param {object} credentials - AWS credentials (region, accessKeyId, secretAccessKey)
 * @returns {object} Signed headers including Authorization and X-Amz-Date
 */
function signRequest(url, method, headers, bodyBuf, credentials) {
    const signOpts = {
        host: url.host,
        method: method,
        path: url.pathname + url.search,
        service: "dynamodb",
        region: credentials.region,
        headers: headers,
        body: bodyBuf.length ? bodyBuf : undefined,
    };

    aws4.sign(signOpts, {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
    });

    return signOpts.headers;
}

/**
 * Forwards signed request to YDB endpoint
 * @param {URL} url - Target URL
 * @param {string} method - HTTP method
 * @param {object} headers - Signed headers
 * @param {Buffer} bodyBuf - Request body buffer
 * @returns {Promise<Response>} Fetch response
 */
async function forwardRequest(url, method, headers, bodyBuf) {
    return await fetch(url.toString(), {
        method: method,
        headers: headers,
        body: bodyBuf.length ? bodyBuf : undefined,
    });
}

app.use(async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const log = createLogger(requestId);

    log.info(`${req.method} ${req.originalUrl}`);

    try {
        // Prepare request body
        const bodyBuf = req.body && req.body.length ? req.body : Buffer.alloc(0);

        // Build target URL
        const url = buildTargetUrl(req, targetBase);

        // Prepare headers for signing
        const headers = pickHeaders(req);

        // Sign request
        const signedHeaders = signRequest(url, req.method, headers, bodyBuf, {
            region: AWS_REGION,
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
        });

        // Forward to YDB
        const upstreamResp = await forwardRequest(url, req.method, signedHeaders, bodyBuf);

        log.info(`→ ${upstreamResp.status} ${upstreamResp.statusText}`);

        // Pass through status and headers to client
        res.status(upstreamResp.status);
        upstreamResp.headers.forEach((v, k) => {
            // Some hop-by-hop headers are better not to pass through
            if (k.toLowerCase() === "transfer-encoding") return;
            res.setHeader(k, v);
        });

        // Send response body
        const respBuf = Buffer.from(await upstreamResp.arrayBuffer());
        res.send(respBuf);

    } catch (e) {
        log.error(`✗ ${e.message}`);
        console.error(e.stack);
        res.status(502).json({ error: String(e && e.message ? e.message : e) });
    }
});

app.listen(PORT, () => {
    console.log("\n" + "=".repeat(50));
    console.log("YDB PROXY SERVER");
    console.log("=".repeat(50));
    console.log(`Config:      ${path.basename(configPath)}`);
    console.log(`Listening:   http://127.0.0.1:${PORT}`);
    console.log(`Target:      ${YDB_ENDPOINT}`);
    console.log(`Region:      ${AWS_REGION}`);
    console.log("=".repeat(50) + "\n");
});
