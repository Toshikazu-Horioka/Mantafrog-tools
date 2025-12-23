import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = process.env.BUCKET!;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

const s3 = new S3Client({});

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS,
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const path = event.rawPath || event.requestContext.http.path;

  try {
    if (path === '/sign-upload' && event.requestContext.http.method === 'POST') {
      return await handleSignUpload(event);
    }
    if (path === '/latest' && event.requestContext.http.method === 'GET') {
      return await handleLatest(event);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Not Found' }),
    };
  } catch (error: any) {
    console.error('Lambda error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error', detail: error?.message }),
    };
  }
};

async function handleSignUpload(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const body = event.body ? JSON.parse(event.body) : {};
  const tool = typeof body.tool === 'string' && body.tool.trim().length > 0 ? body.tool.trim() : null;
  if (!tool) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'tool is required' }),
    };
  }

  const timestamp = new Date().toISOString().replace(/[:]/g, '-');
  const key = `${tool}/${timestamp}-${uuidv4().slice(0, 8)}.json`;
  const latestKey = `${tool}/latest.json`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: 'application/json',
    }),
    { expiresIn: 900 }
  );

  const latestPutUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: latestKey,
      ContentType: 'application/json',
      CacheControl: 'no-store',
    }),
    { expiresIn: 900 }
  );

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      uploadUrl,
      key,
      latestKey,
      latestPutUrl,
      expiresInSeconds: 900,
    }),
  };
}

async function handleLatest(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const tool = event.queryStringParameters?.tool;
  if (!tool) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'tool query parameter is required' }),
    };
  }

  const latestKey = `${tool}/latest.json`;

  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: latestKey }));
  } catch (err: any) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'latest.json not found' }) };
    }
    throw err;
  }

  const latestGet = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: latestKey,
      ResponseCacheControl: 'no-store',
    }),
    { expiresIn: 300 }
  );

  const latestObj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: latestKey }));
  const latestBody = await streamToString(latestObj.Body);
  const latestPayload = latestBody ? JSON.parse(latestBody) : {};
  const dataKey: string | undefined = latestPayload.key;

  if (!dataKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'latest.json has no key' }) };
  }

  const dataUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: dataKey,
      ResponseCacheControl: 'no-store',
    }),
    { expiresIn: 300 }
  );

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      latestUrl: latestGet,
      dataUrl,
      key: dataKey,
      updatedAt: latestPayload.updatedAt ?? latestObj.LastModified,
    }),
  };
}

async function streamToString(stream: any): Promise<string> {
  if (!stream) return '';
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

