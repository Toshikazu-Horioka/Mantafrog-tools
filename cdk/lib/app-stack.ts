import * as path from 'path';
import { Duration, RemovalPolicy, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, BucketEncryption, HttpMethods, CorsRule } from 'aws-cdk-lib/aws-s3';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

export class MantafrogToolsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';
    const corsRules: CorsRule[] = [
      {
        allowedOrigins: allowedOrigins === '*' ? ['*'] : allowedOrigins.split(',').map((o) => o.trim()),
        allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.HEAD],
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag'],
        maxAge: 3600,
      },
    ];

    const bucket = new Bucket(this, 'MantafrogDataBucket', {
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      cors: corsRules,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const signerFunction = new NodejsFunction(this, 'PresignFunction', {
      runtime: Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'lambda', 'handler.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      environment: {
        BUCKET: bucket.bucketName,
        ALLOWED_ORIGINS: allowedOrigins,
      },
      bundling: {
        target: 'es2020',
      },
    });

    bucket.grantReadWrite(signerFunction);

    const api = new HttpApi(this, 'MantafrogHttpApi', {
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.HEAD, CorsHttpMethod.OPTIONS],
        allowOrigins: allowedOrigins === '*' ? ['*'] : allowedOrigins.split(',').map((o) => o.trim()),
        maxAge: Duration.hours(1),
      },
    });

    const integration = new HttpLambdaIntegration('SignerIntegration', signerFunction);

    api.addRoutes({
      path: '/sign-upload',
      methods: [HttpMethod.POST],
      integration,
    });

    api.addRoutes({
      path: '/latest',
      methods: [HttpMethod.GET],
      integration,
    });

    new CfnOutput(this, 'ApiEndpoint', { value: api.apiEndpoint });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}

