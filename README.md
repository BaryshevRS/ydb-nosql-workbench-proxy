# YDB NoSQL Workbench Proxy

Local proxy server for connecting AWS NoSQL Workbench to Yandex Database (YDB) via DynamoDB-compatible Document API.

## What is this?

AWS NoSQL Workbench is a great tool for working with DynamoDB tables. This proxy allows you to use it with YDB by:
- Running locally on your machine (localhost)
- Signing all requests with AWS Signature V4
- Forwarding requests to YDB Document API endpoint
- Proxying responses back to NoSQL Workbench

## Quick Start

1. **Install dependencies**
```bash
npm install
```

2. **Create `.env` file** with your YDB credentials
```env
YDB_ENDPOINT=https://docapi.serverless.yandexcloud.net/ru-central1/b1gxxxxxx/etnxxxxxx
AWS_ACCESS_KEY_ID=YCAJExxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=YCOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=ru-central1
PORT=8000
```

3. **Start proxy**
```bash
node proxy.js
```

You should see:
```
========== YDB PROXY SERVER STARTED ==========
Server listening on: http://127.0.0.1:8000
Target endpoint: https://docapi.serverless...
AWS Region: ru-central1
==============================================
```

4. **Configure NoSQL Workbench**
   - Open AWS NoSQL Workbench
   - Go to "Operation builder" → Add connection
   - Select "DynamoDB local"
   - Set connection settings:
     - **Endpoint**: `http://localhost:8000`
     - **Region**: `ru-central1` (or your region)
     - **Access Key ID**: Your `AWS_ACCESS_KEY_ID`
     - **Secret Access Key**: Your `AWS_SECRET_ACCESS_KEY`
   - Click "Connect"

That's it! Now you can work with your YDB tables through NoSQL Workbench.

## Running Multiple Proxies

You can run multiple proxy servers for different YDB databases simultaneously.

### Method 1: Manual (Simple)

Create multiple config files:
```
.env
.env.production
.env.staging
.env.development
```

Run each proxy in a separate terminal:
```bash
# Terminal 1
node proxy.js production    # Uses .env.production, Port 8000

# Terminal 2
node proxy.js staging       # Uses .env.staging, Port 8001

# Terminal 3
node proxy.js development   # Uses .env.development, Port 8002
```

> **Note:** Config name is automatically prefixed with `.env.`
> - `node proxy.js production` → loads `.env.production`
> - `node proxy.js db1` → loads `.env.db1`
> - `node proxy.js` → loads `.env` (default)

### Method 2: PM2 (Advanced)

Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'ydb-proxy-prod',
      script: 'proxy.js',
      args: 'production'
    },
    {
      name: 'ydb-proxy-stage',
      script: 'proxy.js',
      args: 'staging'
    },
    {
      name: 'ydb-proxy-test',
      script: 'proxy.js',
      args: 'testing'
    }
  ]
};
```

Manage all proxies:
```bash
pm2 start ecosystem.config.js    # Start all
pm2 logs                          # View logs
pm2 list                          # List all processes
pm2 restart all                   # Restart all
pm2 stop all                      # Stop all
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YDB_ENDPOINT` | ✅ Yes | - | Full YDB Document API endpoint URL from Yandex Cloud console |
| `AWS_ACCESS_KEY_ID` | ✅ Yes | - | Static access key ID (create in Yandex Cloud IAM) |
| `AWS_SECRET_ACCESS_KEY` | ✅ Yes | - | Static secret access key |
| `AWS_REGION` | No | `ru-central1` | Yandex Cloud region |
| `PORT` | No | `8000` | Local proxy port |

## Getting YDB Credentials

1. Go to [Yandex Cloud Console](https://console.cloud.yandex.ru/)
2. Navigate to your YDB database
3. Copy the **Document API endpoint** (starts with `https://docapi.serverless...`)
4. Create **Static Access Key** in IAM section
5. Copy Access Key ID and Secret Key
6. Paste them into `.env` file

## How It Works

```
NoSQL Workbench → localhost:8000 → [Proxy signs request] → YDB Document API
                                                                    ↓
NoSQL Workbench ← localhost:8000 ← [Proxy forwards response] ← YDB Document API
```

The proxy:
1. Receives DynamoDB API request from NoSQL Workbench
2. Preserves request body and necessary headers
3. Signs request with AWS Signature Version 4
4. Forwards to your YDB endpoint
5. Returns YDB response back to NoSQL Workbench

## Troubleshooting

### NoSQL Workbench can't connect
- Check that proxy is running (`node proxy.js`)
- Verify port 8000 is not used by another application
- Use `http://localhost:8000` (not https)

### Authentication error
- Double-check `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`
- Verify credentials have permissions for your YDB database
- Make sure static key is active in Yandex Cloud IAM

### Tables not showing
- Verify `YDB_ENDPOINT` includes full path with database ID
- Check region matches between proxy and NoSQL Workbench settings
- Look at proxy console logs for detailed error messages

### Signature mismatch
- Ensure you're using the same credentials in `.env` and NoSQL Workbench
- Check system time is synchronized
- Verify `YDB_ENDPOINT` format is correct

## Debug Logging

The proxy logs every request with details:
- Request ID for tracking
- HTTP method and URL
- Request/response headers
- Body content (for small requests)
- Signing process details
- Error stack traces

Check console output to debug connection issues.

## Using with AWS SDK

You can also use this proxy with AWS SDK for Node.js:

```javascript
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB({
  endpoint: 'http://localhost:8000',
  region: 'ru-central1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Now use dynamodb client as usual
dynamodb.listTables({}, (err, data) => {
  if (err) console.error(err);
  else console.log(data);
});
```

## Security

⚠️ **Important:**
- Never commit `.env` file to git (already in `.gitignore`)
- Use this proxy only for local development
- Don't expose proxy port to the internet
- For production, use YDB SDK directly

## Dependencies

- **express** - Web server framework
- **aws4** - AWS Signature V4 signing
- **dotenv** - Environment variables loader
- **node-fetch** - HTTP client

## Requirements

- Node.js 18 or higher
- YDB database with Document API enabled
- AWS NoSQL Workbench (download from AWS website)

## License

Private project
