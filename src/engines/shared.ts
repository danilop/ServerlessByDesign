import jsyaml from 'js-yaml';
import type { Model, RenderingRules, EngineStatus } from '../types';

// YAML dump with CloudFormation intrinsic function fix.
// js-yaml wraps !Ref, !GetAtt, !Sub in single quotes — CloudFormation needs them unquoted.
export function dumpYaml(template: Record<string, unknown>): string {
  return jsyaml.dump(template, { lineWidth: 1024 }).replace(/'(!.+)'/g, '$1');
}

// Common render loop shared by both engines.
// Iterates model nodes and applies the engine's rendering rules.
export function renderNodes(model: Model, renderingRules: RenderingRules, status: EngineStatus): void {
  for (const id in model.nodes) {
    const node = model.nodes[id];
    renderingRules[node.type].resource(status, node);
  }
}

// Step Functions default state machine definition (identical in both engines)
export const defaultStateMachineDefinition = {
  Comment: 'A Hello World example',
  StartAt: 'HelloWorld',
  States: {
    HelloWorld: {
      Type: 'Pass',
      Result: 'Hello World!',
      End: true
    }
  }
};

// DynamoDB table default properties (identical in both engines)
export const defaultTableProperties = {
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'version', AttributeType: 'N' }
  ],
  KeySchema: [
    { AttributeName: 'id', KeyType: 'HASH' },
    { AttributeName: 'version', KeyType: 'RANGE' }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  StreamSpecification: {
    StreamViewType: 'NEW_AND_OLD_IMAGES'
  }
};

// Kinesis Analytics application default input schema (identical in both engines)
export const defaultAnalyticsInputSchema = {
  RecordColumns: [{
    Name: 'example',
    SqlType: 'VARCHAR(16)',
    Mapping: '$.example'
  }],
  RecordFormat: {
    RecordFormatType: 'JSON',
    MappingParameters: {
      JSONMappingParameters: {
        RecordRowPath: '$'
      }
    }
  }
};

// IoT republish role template (identical structure in both engines, minus intrinsic fn syntax)
export function createIotRepublishRole(_republishRoleId: string) {
  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: ['sts:AssumeRole'],
          Principal: {
            Service: ['iot.amazonaws.com']
          }
        }]
      },
      Policies: [{
        PolicyName: 'publish',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [] as Record<string, unknown>[]
        }
      }]
    }
  };
}
