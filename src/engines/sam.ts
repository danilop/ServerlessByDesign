import {
  dumpYaml, renderNodes,
  defaultStateMachineDefinition, defaultTableProperties,
  defaultAnalyticsInputSchema, createIotRepublishRole
} from './shared';
import type { Model, ModelNode, EngineStatus, RenderingRules } from '../types';

interface RuntimeConfig {
  fileExtension: string;
  handler: string;
  startingCode: string;
}

const runtimes: Record<string, RuntimeConfig> = {
  'nodejs22.x': {
    fileExtension: 'mjs',
    handler: 'handler',
    startingCode:
    `export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from Lambda!' }),
  };
};
`
  },
  'nodejs20.x': {
    fileExtension: 'mjs',
    handler: 'handler',
    startingCode:
    `export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello from Lambda!' }),
  };
};
`
  },
  'python3.13': {
    fileExtension: 'py',
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
        "body": json.dumps({"message": "Hello from Lambda!"})
    }
`
  },
  'python3.12': {
    fileExtension: 'py',
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
        "body": json.dumps({"message": "Hello from Lambda!"})
    }
`
  }
};

const renderingRules: RenderingRules = {
  bucket: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = {
        Type: 'AWS::S3::Bucket'
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Bucket' + idFrom] = {
        Type: 'S3',
        Properties: {
          Bucket: '!Ref ' + idFrom,
          Events: 's3:ObjectCreated:*'
        }
      };
      status.template.Resources[id].Properties.Policies.push('AmazonS3ReadOnlyAccess');
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject'],
        Resource: '!Sub ${' + idTo + '.Arn}/*'
      };
    },
  },
  table: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = {
        Type: 'AWS::DynamoDB::Table',
        Properties: { ...defaultTableProperties }
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Table' + idFrom] = {
        Type: 'DynamoDB',
        Properties: {
          Stream: '!GetAtt ' + idFrom + '.StreamArn',
          StartingPosition: 'TRIM_HORIZON',
          BatchSize: 10
        }
      };
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        Resource: '!GetAtt ' + idTo + '.Arn'
      };
    },
  },
  api: {
    resource() { /* Created by the API event */ },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Api' + idFrom] = {
        Type: 'Api',
        Properties: { Path: '/{proxy+}', Method: 'ANY' }
      };
    },
    policy() {
      return {
        Effect: 'Allow',
        Action: 'execute-api:Invoke',
        Resource: '!Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:*/*/*/*'
      };
    },
  },
  stream: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = {
        Type: 'AWS::Kinesis::Stream',
        Properties: { ShardCount: 1 }
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Stream' + idFrom] = {
        Type: 'Kinesis',
        Properties: {
          Stream: '!GetAtt ' + idFrom + '.Arn',
          StartingPosition: 'TRIM_HORIZON',
          BatchSize: 10
        }
      };
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['kinesis:PutRecord', 'kinesis:PutRecords'],
        Resource: '!GetAtt ' + idTo + '.Arn'
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
      status.template.Resources[node.id] = {
        DependsOn: [deliveryPolicyId],
        Type: 'AWS::KinesisFirehose::DeliveryStream',
        Properties: {
          ExtendedS3DestinationConfiguration: {
            BucketARN: '!GetAtt ' + targetBucketId + '.Arn',
            BufferingHints: { IntervalInSeconds: 60, SizeInMBs: 50 },
            CompressionFormat: 'UNCOMPRESSED',
            Prefix: 'firehose/',
            RoleARN: '!GetAtt ' + deliveryRoleId + '.Arn'
          }
        }
      };
      if (targetFnId !== null) {
        status.template.Resources[node.id].Properties
          .ExtendedS3DestinationConfiguration.ProcessingConfiguration = {
            Enabled: true,
            Processors: [{
              Parameters: [{ ParameterName: 'LambdaArn', ParameterValue: '!GetAtt ' + targetFnId + '.Arn' }],
              Type: 'Lambda'
            }]
          };
      }
      status.template.Resources[deliveryRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'firehose.amazonaws.com' },
              Action: 'sts:AssumeRole',
              Condition: { StringEquals: { 'sts:ExternalId': '!Ref AWS::AccountId' } }
            }]
          }
        }
      };
      status.template.Resources[deliveryPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'firehose_delivery_policy',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Action: ['s3:AbortMultipartUpload', 's3:GetBucketLocation', 's3:GetObject', 's3:ListBucket', 's3:ListBucketMultipartUploads', 's3:PutObject'],
              Resource: ['!GetAtt ' + targetBucketId + '.Arn']
            }]
          },
          Roles: ['!Ref ' + deliveryRoleId]
        }
      };
    },
    event() { },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
        Resource: '!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${' + idTo + '}'
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

      status.template.Resources[node.id] = {
        Type: 'AWS::KinesisAnalytics::Application',
        Properties: {
          ApplicationName: node.id,
          Inputs: [{ NamePrefix: 'exampleNamePrefix', InputSchema: { ...defaultAnalyticsInputSchema } }]
        }
      };

      if (node.description !== '') {
        status.template.Resources[node.id].Properties.ApplicationDescription = node.description;
      }
      if (inputStreamId !== null) {
        status.template.Resources[node.id].Properties.Inputs[0].KinesisStreamsInput = {
          ResourceARN: '!GetAtt ' + inputStreamId + '.Arn',
          RoleARN: '!GetAtt ' + analyticsRoleId + '.Arn'
        };
      }
      if (inputDeliveryStreamId !== null) {
        status.template.Resources[node.id].Properties.Inputs[0].KinesisFirehoseInput = {
          ResourceARN: '!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${' + inputDeliveryStreamId + '}',
          RoleARN: '!GetAtt ' + analyticsRoleId + '.Arn'
        };
      }

      const policyStatements = [];
      if (inputStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards'],
          Resource: '!GetAtt ' + inputStreamId + '.Arn'
        });
      }
      if (inputDeliveryStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['firehose:DescribeDeliveryStream'],
          Resource: '!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${' + inputDeliveryStreamId + '}'
        });
      }
      if (outputStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['kinesis:PutRecord', 'kinesis:PutRecords'],
          Resource: '!GetAtt ' + outputStreamId + '.Arn'
        });
      }
      if (outputDeliveryStreamId !== null) {
        policyStatements.push({
          Effect: 'Allow',
          Action: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
          Resource: '!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${' + outputDeliveryStreamId + '}'
        });
      }
      status.template.Resources[analyticsRoleId] = {
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

      status.template.Resources[analyticsOutputId] = {
        Type: 'AWS::KinesisAnalytics::ApplicationOutput',
        DependsOn: node.id,
        Properties: {
          ApplicationName: '!Ref ' + node.id,
          Output: { Name: 'exampleOutput', DestinationSchema: { RecordFormatType: 'CSV' } }
        }
      };

      if (outputStreamId !== null) {
        status.template.Resources[analyticsOutputId].Properties.Output.KinesisStreamsOutput = {
          ResourceARN: '!GetAtt ' + outputStreamId + '.Arn',
          RoleARN: '!GetAtt ' + analyticsRoleId + '.Arn'
        };
      }
      if (outputDeliveryStreamId !== null) {
        status.template.Resources[analyticsOutputId].Properties.Output.KinesisFirehoseOutput = {
          ResourceARN: '!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${' + outputDeliveryStreamId + '}',
          RoleARN: '!GetAtt ' + analyticsRoleId + '.Arn'
        };
      }
    },
    event() { },
    policy() { }
  },
  schedule: {
    resource() { },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Schedule' + idFrom] = {
        Type: 'Schedule',
        Properties: { Schedule: 'rate(5 minutes)' }
      };
    },
    policy() { }
  },
  topic: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = { Type: 'AWS::SNS::Topic' };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Topic' + idFrom] = {
        Type: 'SNS',
        Properties: { Topic: '!Ref ' + idFrom }
      };
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return { Effect: 'Allow', Action: 'sns:Publish', Resource: '!Ref ' + idTo };
    },
  },
  queue: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = { Type: 'AWS::SQS::Queue' };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['Queue' + idFrom] = {
        Type: 'SQS',
        Properties: {
          Queue: '!GetAtt ' + idFrom + '.Arn',
          BatchSize: 10
        }
      };
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['sqs:SendMessage'],
        Resource: '!GetAtt ' + idTo + '.Arn'
      };
    },
  },
  eventBus: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = {
        Type: 'AWS::Events::EventBus',
        Properties: { Name: node.id }
      };
    },
    event(status: EngineStatus, id: string, idFrom: string) {
      status.template.Resources[id].Properties.Events['EventBus' + idFrom] = {
        Type: 'EventBridgeRule',
        Properties: {
          EventBusName: '!Ref ' + idFrom,
          Pattern: { source: ['my-application'] }
        }
      };
    },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['events:PutEvents'],
        Resource: '!GetAtt ' + idTo + '.Arn'
      };
    },
  },
  fn: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = {
        Type: 'AWS::Serverless::Function',
        Properties: {
          Handler: node.id + '.' + runtimes[status.runtime].handler,
          Runtime: status.runtime,
          CodeUri: '.',
          Policies: []
        }
      };
      if (node.description !== '') {
        status.template.Resources[node.id].Properties.Description = node.description;
      }
      status.files[node.id + '.' + runtimes[status.runtime].fileExtension] =
        runtimes[status.runtime].startingCode;
      if (node.from.length > 0) {
        status.template.Resources[node.id].Properties.Events = {};
        node.from.forEach((idFrom) => {
          renderingRules[status.model.nodes[idFrom].type].event(status, node.id, idFrom);
        });
      }
      if (node.to.length > 0) {
        const policy = { Version: '2012-10-17', Statement: [] as unknown[] };
        node.to.forEach((idTo) => {
          policy.Statement.push(
            renderingRules[status.model.nodes[idTo].type].policy(status, node.id, idTo)
          );
        });
        status.template.Resources[node.id].Properties.Policies.push(policy);
      }
    },
    event() { },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['lambda:InvokeFunction'],
        Resource: '!GetAtt ' + idTo + '.Arn'
      };
    }
  },
  stepFn: {
    resource(status: EngineStatus, node: ModelNode) {
      status.template.Resources[node.id] = {
        Type: 'AWS::StepFunctions::StateMachine',
        Properties: {
          RoleArn: '!Sub arn:aws:iam::${AWS::AccountId}:role/service-role/StatesExecutionRole-${AWS::Region}'
        },
      };
      status.template.Resources[node.id].Properties.DefinitionString =
        JSON.stringify(defaultStateMachineDefinition, null, 2);
    },
    event() { },
    policy(_status: EngineStatus, _id: string, idTo: string) {
      return {
        Effect: 'Allow',
        Action: ['states:DescribeExecution', 'states:GetExecutionHistory', 'states:ListExecutions', 'states:StartExecution', 'states:StopExecution'],
        Resource: ['!Ref ' + idTo]
      };
    }
  },
  cognitoIdentity: {
    resource(status: EngineStatus, node: ModelNode) {
      const cognitoUnauthRoleId = node.id + 'CognitoUnauthRole';
      const cognitoUnauthPolicyId = node.id + 'CognitoUnauthPolicy';
      status.template.Resources[node.id] = {
        Type: 'AWS::Cognito::IdentityPool',
        Properties: { AllowUnauthenticatedIdentities: false }
      };
      status.template.Resources[cognitoUnauthRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: { Federated: 'cognito-identity.amazonaws.com' },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: { 'cognito-identity.amazonaws.com:aud': '!Ref ' + node.id },
                'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
              }
            }]
          }
        }
      };
      status.template.Resources[cognitoUnauthPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: 'cognito_unauth_policy',
          PolicyDocument: { Version: '2012-10-17', Statement: [] },
          Roles: ['!Ref ' + cognitoUnauthRoleId]
        }
      };
      node.to.forEach((idTo) => {
        status.template.Resources[cognitoUnauthPolicyId]
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
      status.template.Resources[node.id] = {
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
        status.template.Resources[node.id].Properties.TopicRulePayload.Description = node.description;
      }
      node.to.forEach((idTo) => {
        const nodeTo = status.model.nodes[idTo];
        switch (nodeTo.type) {
          case 'fn':
            status.template.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Lambda: { FunctionArn: '!GetAtt ' + idTo + '.Arn' }
            });
            break;
          case 'iotRule': {
            const republishRoleId = idTo + 'PublishRole';
            status.template.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Republish: { Topic: 'Output/Topic', RoleArn: '!GetAtt ' + republishRoleId + '.Arn' }
            });
            const role = createIotRepublishRole(republishRoleId);
            role.Properties.Policies[0].PolicyDocument.Statement.push({
              Effect: 'Allow',
              Action: 'iot:Publish',
              Resource: '!Sub arn:aws:iot:${AWS::Region}:${AWS::AccountId}:topic/Output/*'
            });
            status.template.Resources[republishRoleId] = role;
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

function render(model: Model, runtime: string, deployment?: string): Record<string, string> {
  const files: Record<string, string> = {};
  const template: Record<string, any> = {
    AWSTemplateFormatVersion: '2010-09-09',
    Transform: 'AWS::Serverless-2016-10-31'
  };

  if (deployment) {
    template.Globals = {
      Function: {
        AutoPublishAlias: 'live',
        DeploymentPreference: { Type: deployment }
      }
    };
  }

  template.Resources = {};
  const status = { model, runtime, files, template };
  renderNodes(model, renderingRules, status);

  files['template.yaml'] = dumpYaml(template);
  return files;
}

export default render;
