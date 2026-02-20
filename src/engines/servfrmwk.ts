import {
  dumpYaml, renderNodes,
  defaultStateMachineDefinition, defaultTableProperties,
  defaultAnalyticsInputSchema, createIotRepublishRole
} from './shared';
import type { Model, ModelNode, EngineStatus, RenderingRules } from '../types';

interface RuntimeConfig {
  fileExtension: string;
  gitignore: string;
  handler: string;
  startingCode: string;
}

const runtimes: Record<string, RuntimeConfig> = {
  'nodejs22.x': {
    fileExtension: 'mjs',
    gitignore: `node_modules/
.serverless/
`,
    handler: 'handler',
    startingCode:
    `export const handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from Serverless!',
      input: event,
    }),
  };
};
`
  },
  'nodejs20.x': {
    fileExtension: 'mjs',
    gitignore: `node_modules/
.serverless/
`,
    handler: 'handler',
    startingCode:
    `export const handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello from Serverless!',
      input: event,
    }),
  };
};
`
  },
  'python3.13': {
    fileExtension: 'py',
    gitignore: `.Python
env/
.venv/
__pycache__/
*.egg-info/
.serverless/
`,
    handler: 'lambda_handler',
    startingCode:
    `import json
import logging

logger = logging.getLogger()
logger.setLevel("INFO")

def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event)}")
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Hello from Serverless!"})
    }
`
  },
  'python3.12': {
    fileExtension: 'py',
    gitignore: `.Python
env/
.venv/
__pycache__/
*.egg-info/
.serverless/
`,
    handler: 'lambda_handler',
    startingCode:
    `import json
import logging

logger = logging.getLogger()
logger.setLevel("INFO")

def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event)}")
    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Hello from Serverless!"})
    }
`
  }
};

const renderingRules: RenderingRules = {
  bucket: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::S3::Bucket'
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.functions[id].events.push({
        s3: {
          bucket: idFrom,
          event: 's3:ObjectCreated:*'
        }
      });
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject'],
        Resource: {
          'Fn::Join': ['', [{ 'Fn::GetAtt': [idTo, 'Arn'] }, '/*']]
        }
      };
    },
  },
  table: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::DynamoDB::Table',
        Properties: { ...defaultTableProperties }
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.functions[id].events.push({
        stream: {
          type: 'dynamodb',
          arn: { 'Fn::GetAtt': [idFrom, 'StreamArn'] }
        }
      });
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        Resource: { 'Fn::GetAtt': [idTo, 'Arn'] }
      };
    },
  },
  api: {
    resource() { /* Created by the API event */ },
    event(status: EngineStatus, id: string, _idFrom: string) {
      status.template.functions[id].events.push({
        http: { path: '/{proxy+}', method: 'get' }
      });
    },
    policy() {
      return {
        Effect: 'Allow',
        Action: 'execute-api:Invoke',
        Resource: {
          'Fn::Join': ['', [
            'arn:aws:execute-api:',
            { Ref: 'AWS::Region' }, ':',
            { Ref: 'AWS::AccountId' },
            ':*/*/*/*'
          ]]
        }
      };
    },
  },
  stream: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::Kinesis::Stream',
        Properties: { ShardCount: 1 }
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.functions[id].events.push({
        stream: {
          type: 'kinesis',
          arn: { 'Fn::GetAtt': [idFrom, 'Arn'] }
        }
      });
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['kinesis:PutRecord', 'kinesis:PutRecords'],
        Resource: { 'Fn::GetAtt': [idTo, 'Arn'] }
      };
    },
  },
  deliveryStream: {
    resource(status: EngineStatus, node: ModelNode) {
      let targetBucketId = null;
      let targetFnId = null;
      node.to.forEach((idTo) => {
        const nodeTo = status.model.nodes[idTo];
        if (nodeTo.type === 'bucket') targetBucketId = idTo;
        else if (nodeTo.type === 'fn') targetFnId = idTo;
      });
      if (targetBucketId === null) {
        console.error('Delivery Stream without a destination');
        return;
      }
      const deliveryPolicyId = node.id + 'DeliveryPolicy';
      const deliveryRoleId = node.id + 'DeliveryRole';
      status.template.resources.Resources[node.id] = {
        DependsOn: [deliveryPolicyId],
        Type: 'AWS::KinesisFirehose::DeliveryStream',
        Properties: {
          ExtendedS3DestinationConfiguration: {
            BucketARN: { 'Fn::GetAtt': [targetBucketId, 'Arn'] },
            BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 50 },
            CompressionFormat: 'UNCOMPRESSED',
            Prefix: 'firehose/',
            RoleARN: { 'Fn::GetAtt': [deliveryRoleId, 'Arn'] }
          }
        }
      };
      if (targetFnId !== null) {
        status.template.resources.Resources[node.id].Properties
          .ExtendedS3DestinationConfiguration.ProcessingConfiguration = {
            Enabled: true,
            Processors: [{
              Parameters: [{ ParameterName: 'LambdaArn', ParameterValue: { 'Fn::GetAtt': [`${targetFnId}LambdaFunction`, 'Arn'] } }],
              Type: 'Lambda'
            }]
          };
      }
      status.template.resources.Resources[deliveryRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'firehose.amazonaws.com' },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: { 'sts:ExternalId': { Ref: 'AWS::AccountId' } }
              }
            }]
          }
        }
      };
      status.template.resources.Resources[deliveryPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'firehose_delivery_policy',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Action: ['s3:AbortMultipartUpload', 's3:GetBucketLocation', 's3:GetObject', 's3:ListBucket', 's3:ListBucketMultipartUploads', 's3:PutObject'],
              Resource: { 'Fn::GetAtt': [targetBucketId, 'Arn'] }
            }]
          },
          Roles: [{ Ref: deliveryRoleId }]
        }
      };
    },
    event() { },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
        Resource: {
          'Fn::Join': ['', [
            'arn:aws:firehose:',
            { Ref: 'AWS::Region' }, ':',
            { Ref: 'AWS::AccountId' },
            `:deliverystream/${idTo}`
          ]]
        }
      };
    },
  },
  analyticsStream: {
    resource(status: EngineStatus, node: ModelNode) {
      let inputStreamId = null;
      let inputDeliveryStreamId = null;
      node.from.forEach((idFrom) => {
        const nodeFrom = status.model.nodes[idFrom];
        if (nodeFrom.type === 'stream') inputStreamId = idFrom;
        else if (nodeFrom.type === 'deliveryStream') inputDeliveryStreamId = idFrom;
      });

      let outputStreamId = null;
      let outputDeliveryStreamId = null;
      node.to.forEach((idTo) => {
        const nodeTo = status.model.nodes[idTo];
        if (nodeTo.type === 'stream') outputStreamId = idTo;
        else if (nodeTo.type === 'deliveryStream') outputDeliveryStreamId = idTo;
      });

      const analyticsRoleId = node.id + 'Role';
      const analyticsOutputId = node.id + 'Outputs';

      status.template.resources.Resources[node.id] = {
        Type: 'AWS::KinesisAnalytics::Application',
        Properties: {
          ApplicationName: node.id,
          Inputs: [{ NamePrefix: 'exampleNamePrefix', InputSchema: { ...defaultAnalyticsInputSchema } }]
        }
      };

      if (node.description !== '') {
        status.template.resources.Resources[node.id].Properties.ApplicationDescription = node.description;
      }
      if (inputStreamId !== null) {
        status.template.resources.Resources[node.id].Properties.Inputs[0].KinesisStreamsInput = {
          ResourceARN: { 'Fn::GetAtt': [inputStreamId, 'Arn'] },
          RoleARN: { 'Fn::GetAtt': [analyticsRoleId, 'Arn'] }
        };
      }
      if (inputDeliveryStreamId !== null) {
        status.template.resources.Resources[node.id].Properties.Inputs[0].KinesisFirehoseInput = {
          ResourceARN: {
            'Fn::Join': ['', [
              'arn:aws:firehose:',
              { Ref: 'AWS::Region' }, ':',
              { Ref: 'AWS::AccountId' },
              `:deliverystream/${inputDeliveryStreamId}`
            ]]
          },
          RoleARN: { 'Fn::GetAtt': [analyticsRoleId, 'Arn'] }
        };
      }

      const policyStatements = [];
      if (inputStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards'],
          Resource: { 'Fn::GetAtt': [inputStreamId, 'Arn'] }
        });
      }
      if (inputDeliveryStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['firehose:DescribeDeliveryStream'],
          Resource: {
            'Fn::Join': ['', [
              'arn:aws:firehose:',
              { Ref: 'AWS::Region' }, ':',
              { Ref: 'AWS::AccountId' },
              `:deliverystream/${inputDeliveryStreamId}`
            ]]
          }
        });
      }
      if (outputStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['kinesis:PutRecord', 'kinesis:PutRecords'],
          Resource: { 'Fn::GetAtt': [outputStreamId, 'Arn'] }
        });
      }
      if (outputDeliveryStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
          Resource: {
            'Fn::Join': ['', [
              'arn:aws:firehose:',
              { Ref: 'AWS::Region' }, ':',
              { Ref: 'AWS::AccountId' },
              `:deliverystream/${outputDeliveryStreamId}`
            ]]
          }
        });
      }
      status.template.resources.Resources[analyticsRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{ Effect: 'Allow', Principal: { Service: 'kinesisanalytics.amazonaws.com' }, Action: 'sts:AssumeRole' }]
          },
          Path: '/',
          Policies: [{
            PolicyName: 'KinesisAnalyticsPolicy',
            PolicyDocument: { Version: '2012-10-17', Statement: policyStatements }
          }]
        }
      };

      status.template.resources.Resources[analyticsOutputId] = {
        Type: 'AWS::KinesisAnalytics::ApplicationOutput',
        DependsOn: node.id,
        Properties: {
          ApplicationName: { Ref: node.id },
          Output: { Name: 'exampleOutput', DestinationSchema: { RecordFormatType: 'CSV' } }
        }
      };

      if (outputStreamId !== null) {
        status.template.resources.Resources[analyticsOutputId].Properties.Output.KinesisStreamsOutput = {
          ResourceARN: { 'Fn::GetAtt': [outputStreamId, 'Arn'] },
          RoleARN: { 'Fn::GetAtt': [analyticsRoleId, 'Arn'] }
        };
      }
      if (outputDeliveryStreamId !== null) {
        status.template.resources.Resources[analyticsOutputId].Properties.Output.KinesisFirehoseOutput = {
          ResourceARN: {
            'Fn::Join': ['', [
              'arn:aws:firehose:',
              { Ref: 'AWS::Region' }, ':',
              { Ref: 'AWS::AccountId' },
              `:deliverystream/${outputDeliveryStreamId}`
            ]]
          },
          RoleARN: { 'Fn::GetAtt': [analyticsRoleId, 'Arn'] }
        };
      }
    },
    event() { },
    policy() { }
  },
  schedule: {
    resource() { },
    event(status: EngineStatus, id: string, _idFrom: string) {
      status.template.functions[id].events.push({
        schedule: 'rate(5 minutes)'
      });
    },
    policy() { }
  },
  topic: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = { Type: 'AWS::SNS::Topic' };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.functions[id].events.push({ sns: idFrom });
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: 'sns:Publish',
        Resource: { Ref: idTo }
      };
    },
  },
  queue: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = { Type: 'AWS::SQS::Queue' };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.functions[id].events.push({
        sqs: {
          arn: { 'Fn::GetAtt': [idFrom, 'Arn'] },
          batchSize: 10
        }
      });
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['sqs:SendMessage'],
        Resource: { 'Fn::GetAtt': [idTo, 'Arn'] }
      };
    },
  },
  eventBus: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::Events::EventBus',
        Properties: { Name: node.id }
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.functions[id].events.push({
        eventBridge: {
          eventBus: { 'Fn::GetAtt': [idFrom, 'Arn'] },
          pattern: { source: ['my-application'] }
        }
      });
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['events:PutEvents'],
        Resource: { 'Fn::GetAtt': [idTo, 'Arn'] }
      };
    },
  },
  fn: {
    resource(status: EngineStatus, node: ModelNode) {
      if (!status.files['.gitignore']) {
        status.files['.gitignore'] = runtimes[status.runtime].gitignore;
      }
      status.template.functions[node.id] = {
        handler: node.id + '.' + runtimes[status.runtime].handler
      };
      if (node.description !== '') {
        status.template.functions[node.id].description = node.description;
      }
      status.files[node.id + '.' + runtimes[status.runtime].fileExtension] =
        runtimes[status.runtime].startingCode;
      if (node.from.length > 0) {
        status.template.functions[node.id].events = [];
        node.from.forEach((idFrom) => {
          renderingRules[status.model.nodes[idFrom].type].event(status, node.id, idFrom);
        });
      }
      if (node.to.length > 0) {
        const statements: unknown[] = [];
        node.to.forEach((idTo) => {
          statements.push(
            renderingRules[status.model.nodes[idTo].type].policy(status, node.id, idTo)
          );
        });
        status.template.functions[node.id].iamRoleStatements = statements;
      }
    },
    event() { },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['lambda:InvokeFunction'],
        Resource: { 'Fn::GetAtt': [idTo, 'Arn'] }
      };
    }
  },
  stepFn: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          RoleArn: {
            'Fn::Join': ['', [
              'arn:aws:iam::',
              { Ref: 'AWS::AccountId' },
              ':role/service-role/StatesExecutionRole-',
              { Ref: 'AWS::Region' }
            ]]
          },
        },
      };
      status.template.resources.Resources[node.id].Properties.DefinitionString =
        JSON.stringify(defaultStateMachineDefinition, null, 2);
    },
    event() { },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['states:DescribeExecution', 'states:GetExecutionHistory', 'states:ListExecutions', 'states:StartExecution', 'states:StopExecution'],
        Resource: [{ Ref: idTo }]
      };
    }
  },
  cognitoIdentity: {
    resource(status: EngineStatus, node: ModelNode) {
      const cognitoUnauthRoleId = node.id + 'CognitoUnauthRole';
      const cognitoUnauthPolicyId = node.id + 'CognitoUnauthPolicy';
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::Cognito::IdentityPool',
        Properties: { AllowUnauthenticatedIdentities: false }
      };
      status.template.resources.Resources[cognitoUnauthRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: { Federated: 'cognito-identity.amazonaws.com' },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: { 'cognito-identity.amazonaws.com:aud': { Ref: node.id } },
                'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
              }
            }]
          }
        }
      };
      status.template.resources.Resources[cognitoUnauthPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'cognito_unauth_policy',
          PolicyDocument: { Version: '2012-10-17', Statement: [] },
          Roles: [{ Ref: cognitoUnauthRoleId }]
        }
      };
      node.to.forEach((idTo) => {
        status.template.resources.Resources[cognitoUnauthPolicyId]
          .Properties.PolicyDocument.Statement.push(
            renderingRules[status.model.nodes[idTo].type].policy(status, node.id, idTo)
          );
      });
    },
    event() { },
    policy() { }
  },
  iotRule: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.resources.Resources[node.id] = {
        Type: 'AWS::IoT::TopicRule',
        Properties: {
          TopicRulePayload: {
            RuleDisabled: 'true',
            Sql: "Select temp FROM 'Some/Topic' WHERE temp > 60",
            Actions: []
          }
        }
      };
      if (node.description !== '') {
        status.template.resources.Resources[node.id].Properties.TopicRulePayload.Description = node.description;
      }
      node.to.forEach((idTo) => {
        const nodeTo = status.model.nodes[idTo];
        switch (nodeTo.type) {
          case 'fn':
            status.template.resources.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Lambda: { FunctionArn: { 'Fn::GetAtt': [`${idTo}LambdaFunction`, 'Arn'] } }
            });
            break;
          case 'iotRule': {
            const republishRoleId = idTo + 'PublishRole';
            status.template.resources.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Republish: {
                Topic: 'Output/Topic',
                RoleArn: { 'Fn::GetAtt': [republishRoleId, 'Arn'] }
              }
            });
            const role = createIotRepublishRole(republishRoleId);
            role.Properties.Policies[0].PolicyDocument.Statement.push({
              Effect: 'Allow',
              Action: 'iot:Publish',
              Resource: {
                'Fn::Join': ['', [
                  'arn:aws:iot:',
                  { Ref: 'AWS::Region' }, ':',
                  { Ref: 'AWS::AccountId' },
                  ':topic/Output/*'
                ]]
              }
            });
            status.template.resources.Resources[republishRoleId] = role;
            break;
          }
          default:
            throw new Error('Connection type not supported: ' + nodeTo.type);
        }
      });
    },
    event() { },
    policy() { }
  }
};

function render(model: Model, runtime: string): Record<string, string> {
  const files: Record<string, string> = {};
  const template = {
    service: 'serverless',
    provider: {
      name: 'aws',
      runtime: runtime
    },
    functions: {},
    resources: {
      Resources: {}
    }
  };

  const status = { model, runtime, files, template };
  renderNodes(model, renderingRules, status);

  files['serverless.yml'] = dumpYaml(template);
  return files;
}

export default render;
