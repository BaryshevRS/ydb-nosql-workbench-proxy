# YDB NoSQL Workbench Proxy

A proxy server that enables AWS NoSQL Workbench and other DynamoDB-compatible tools to work with Yandex Database (YDB) by signing requests with AWS Signature Version 4.

## Overview

This proxy server acts as a bridge between DynamoDB-compatible clients (like AWS NoSQL Workbench) and YDB's Document API. It intercepts incoming requests, signs them with AWS4 authentication, and forwards them to your YDB endpoint.

## Features

- AWS Signature Version 4 (SigV4) authentication for YDB Document API
- Full request/response logging with unique request IDs
- Body preservation for accurate signature calculation
- Configurable via environment variables
- Support for all DynamoDB API operations

## Prerequisites

- Node.js (v14 or higher)
- YDB database with Document API enabled
- AWS-compatible credentials for YDB

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd ydb-nosql-workbench-proxy
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root:
```env
YDB_ENDPOINT=https://docapi.serverless.yandexcloud.net/ru-central1/b1g...
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ru-central1
PORT=8000
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YDB_ENDPOINT` | Yes | - | Full YDB Document API endpoint URL |
| `AWS_ACCESS_KEY_ID` | Yes | - | YDB static access key ID |
| `AWS_SECRET_ACCESS_KEY` | Yes | - | YDB static secret access key |
| `AWS_REGION` | No | `ru-central1` | AWS region for signing |
| `PORT` | No | `8000` | Port for the proxy server |

## Usage

### Starting the Server

```bash
node proxy.js
```

The server will start and display:
```
========== YDB PROXY SERVER STARTED ==========
Server listening on: http://127.0.0.1:8000
Target endpoint: https://docapi.serverless...
AWS Region: ru-central1
AWS Access Key ID: YCAJE...
Debug logging: ENABLED
==============================================
```

### Using with AWS NoSQL Workbench

1. Start the proxy server
2. Open AWS NoSQL Workbench
3. Configure a new DynamoDB connection:
   - **Endpoint**: `http://127.0.0.1:8000`
   - **Region**: Match your `AWS_REGION` setting (default: `ru-central1`)
   - **Access Key ID**: Your YDB access key
   - **Secret Access Key**: Your YDB secret key
4. Connect and start working with your YDB tables

### Using with AWS SDK

Configure the AWS SDK to point to the proxy:

```javascript
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB({
  endpoint: 'http://127.0.0.1:8000',
  region: 'ru-central1',
  accessKeyId: 'your_access_key_id',
  secretAccessKey: 'your_secret_access_key'
});
```

## How It Works

1. **Request Reception**: The proxy receives DynamoDB API requests from the client
2. **Header Filtering**: Filters and preserves necessary headers (Content-Type, x-amz-target, etc.)
3. **URL Construction**: Combines the YDB endpoint with the request path
4. **AWS4 Signing**: Signs the request using AWS Signature Version 4
5. **Request Forwarding**: Sends the signed request to YDB
6. **Response Proxying**: Returns the YDB response to the client

## Logging

The proxy provides detailed logging for each request:

- Unique request ID for tracking
- Request method, URL, and headers
- Request and response body (for small payloads < 1KB)
- AWS signing details
- Upstream response status and headers
- Error details with stack traces

## Troubleshooting

### Connection refused
- Ensure the proxy server is running
- Check that the PORT is not already in use
- Verify firewall settings

### Authentication errors
- Verify your `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are correct
- Check that the credentials have proper permissions in YDB
- Ensure the `AWS_REGION` matches your YDB region

### Signature mismatch
- Check that the YDB_ENDPOINT is correct
- Verify that no middleware is modifying the request body
- Check the request timestamp (system clock sync)

## Security Notes

- Never commit your `.env` file to version control
- Use environment-specific credentials
- Consider adding rate limiting for production use
- Run behind a reverse proxy (nginx, Apache) in production
- Use HTTPS in production environments

## Dependencies

- **express** (v5.2.1): Web framework
- **aws4** (v1.13.2): AWS Signature Version 4 signing
- **dotenv** (v17.2.3): Environment variable management
- **node-fetch** (v3.3.2): HTTP client for upstream requests

## License

Private project

## Contributing

This is a private project. Contributions are not currently accepted.

## Support

For YDB-specific issues, refer to the [Yandex Cloud YDB documentation](https://cloud.yandex.com/docs/ydb/).
