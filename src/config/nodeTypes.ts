import type { NodeTypeConfig, NodeConnections } from '../types';

export const nodeTypes: Record<string, NodeTypeConfig> = {
  api: {
    name: 'API Gateway',
    image: './img/aws/Amazon-API-Gateway.png'
  },
  cognitoIdentity: {
    name: 'Cognito Identity',
    image: './img/aws/Amazon-Cognito.png'
  },
  table: {
    name: 'DynamoDB Table',
    image: './img/aws/Amazon-DynamoDB_Table.png'
  },
  analyticsStream: {
    name: 'Kinesis Data Analytics',
    image: './img/aws/Amazon-Kinesis-Data-Analytics.png'
  },
  deliveryStream: {
    name: 'Kinesis Data Firehose',
    image: './img/aws/Amazon-Kinesis-Data-Firehose.png'
  },
  stream: {
    name: 'Kinesis Data Stream',
    image: './img/aws/Amazon-Kinesis-Data-Streams.png'
  },
  iotRule: {
    name: 'IoT Topic Rule',
    image: './img/aws/IoT_Rule.png'
  },
  fn: {
    name: 'Lambda Function',
    image: './img/aws/AWS-Lambda_Function.png'
  },
  bucket: {
    name: 'S3 Bucket',
    image: './img/aws/Amazon-S3_Bucket.png'
  },
  queue: {
    name: 'SQS Queue',
    image: './img/aws/Amazon-SQS_Queue.png'
  },
  eventBus: {
    name: 'EventBridge Bus',
    image: './img/aws/Amazon-EventBridge.png'
  },
  schedule: {
    name: 'Schedule',
    image: './img/aws/Amazon-CloudWatch_Event-Time-Based.png'
  },
  topic: {
    name: 'SNS Topic',
    image: './img/aws/Amazon-SNS_Topic.png'
  },
  stepFn: {
    name: 'Step Function',
    image: './img/aws/AWS-Step-Functions.png'
  },
};

export const nodeConnections: NodeConnections = {
  bucket: {
    topic: { action: 'notification' },
    fn: { action: 'trigger' }
  },
  table: {
    fn: { action: 'stream' }
  },
  api: {
    fn: { action: 'integration' },
    stepFn: { action: 'integration' }
  },
  stream: {
    fn: { action: 'trigger' },
    analyticsStream: { action: 'input' },
    deliveryStream: { action: 'deliver' }
  },
  deliveryStream: {
    bucket: { action: 'destination' },
    fn: { action: 'transform' }
  },
  analyticsStream: {
    stream: { action: 'output' },
    deliveryStream: { action: 'output' }
  },
  schedule: {
    deliveryStream: { action: 'target' },
    stream: { action: 'target' },
    topic: { action: 'target' },
    fn: { action: 'target' }
  },
  topic: {
    fn: { action: 'trigger' }
  },
  queue: {
    fn: { action: 'trigger' }
  },
  eventBus: {
    fn: { action: 'trigger' }
  },
  fn: {
    bucket: { action: 'read/write' },
    table: { action: 'read/write' },
    api: { action: 'invoke' },
    stream: { action: 'put' },
    deliveryStream: { action: 'put' },
    topic: { action: 'notification' },
    queue: { action: 'send' },
    eventBus: { action: 'put' },
    fn: { action: 'invoke' },
    stepFn: { action: 'activity' }
  },
  stepFn: {
    fn: { action: 'invoke' },
  },
  cognitoIdentity: {
    fn: { action: 'authorize' },
    api: { action: 'authorize' }
  },
  iotRule: {
    fn: { action: 'invoke' },
    iotRule: { action: 'republish' }
  }
};
