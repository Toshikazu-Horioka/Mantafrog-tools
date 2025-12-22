#!/usr/bin/env node
import 'source-map-support/register';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { MantafrogToolsStack } from '../lib/app-stack';

// Load environment variables from cdk/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = new cdk.App();

new MantafrogToolsStack(app, 'MantafrogToolsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
});

