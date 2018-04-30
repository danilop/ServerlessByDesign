(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
"use strict";

var runtimes = {
  "nodejs8.10": {
    fileExtension: "js",
    handler: "handler",
    startingCode:
    `'use strict';

console.log("Loading function");

exports.handler = async function(event, context) {
  console.log('Received event:', JSON.stringify(event, null, 2));
  return "Hello World";
  // or 
  // throw new Error(“some error type”); 
};
  
`
  },
  "nodejs6.10": {
    fileExtension: "js",
    handler: "handler",
    startingCode:
    `'use strict';

console.log("Loading function");

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    callback(null, "Hello World");
    // or 
    //callback("Something went wrong");
};
`
  },
  "python3.6": {
    fileExtension: "py",
    handler: "lambda_handler",
    startingCode:
    `import json

print("Loading function")

def lambda_handler(event, context):
    print("Received event: " + json.dumps(event, indent=2))
    return "Hello World"
    #or
    #raise Exception("Something went wrong")
`
  }
}

var renderingRules = {
  bucket: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::S3::Bucket"
      }
    },
    event: function (status, id, idFrom) {
      status.template.Resources[id].Properties.Events['Bucket' + idFrom] = {
        Type: "S3",
        Properties: {
          Bucket: "!Ref " + idFrom,
          Events: "s3:ObjectCreated:*"
        }
      };
      // To avoid circular dependencies with a more specific policy 
      status.template.Resources[id].Properties.Policies.push('AmazonS3ReadOnlyAccess');
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: "!Sub ${" + idTo + ".Arn}/*"
      };
    },
  },
  table: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          AttributeDefinitions: [
            {
              AttributeName: "id",
              AttributeType: "S"
            },
            {
              AttributeName: "version",
              AttributeType: "N"
            }
          ],
          KeySchema: [
            {
              AttributeName: "id",
              KeyType: "HASH"
            },
            {
              AttributeName: "version",
              KeyType: "RANGE"
            }
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          },
          StreamSpecification: {
            StreamViewType: "NEW_AND_OLD_IMAGES"
          }
        }
      };
    },
    event: function (status, id, idFrom) {
      status.template.Resources[id].Properties.Events['Table' + idFrom] = {
        Type: "DynamoDB",
        Properties: {
          Stream: "!GetAtt " + idFrom + ".StreamArn",
          StartingPosition: "TRIM_HORIZON",
          BatchSize: 10
        }
      };
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:PutItem"],
        Resource: "!GetAtt " + idTo + ".Arn"
      };
    },
  },
  api: {
    resource: function (status, node) {
      // Nothing to do, created by the API event
    },
    event: function (status, id, idFrom) {
      status.template.Resources[id].Properties.Events['Api' + idFrom] = {
        Type: "Api",
        Properties: {
          Path: "/{proxy+}",
          Method: "ANY"
        }
      };
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: "execute-api:Invoke",
        Resource: "!Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:*/*/*/*"
      };
    },
  },
  stream: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::Kinesis::Stream",
        Properties: {
          ShardCount: 1
        }
      };
    },
    event: function (status, id, idFrom) {
      status.template.Resources[id].Properties.Events['Stream' + idFrom] = {
        Type: "Kinesis",
        Properties: {
          Stream: "!GetAtt " + idFrom + ".Arn",
          StartingPosition: "TRIM_HORIZON",
          BatchSize: 10
        }
      };
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["kinesis:PutRecord", "kinesis:PutRecords"],
        Resource: "!GetAtt " + idTo + ".Arn"
      };
    },
  },
  deliveryStream: {
    resource: function (status, node) {
      var targetBucketId = null;
      var targetFnId = null;
      node.to.forEach(function (idTo) {  // Target resources
        var node_to = status.model.nodes[idTo];
        if (node_to.type === 'bucket') {
          targetBucketId = idTo;
        } else if (node_to.type === 'fn') {
          targetFnId = idTo;
        }
      });
      if (targetBucketId == null) {
        console.error("Delivery Stream without a destination");
        return;
      }
      var deliveryPolicyId = node.id + "DeliveryPolicy";
      var deliveryRoleId = node.id + "DeliveryRole";
      // Create the Delivery Strem
      status.template.Resources[node.id] = {
        DependsOn: [deliveryPolicyId],
        Type: 'AWS::KinesisFirehose::DeliveryStream',
        Properties: {
          ExtendedS3DestinationConfiguration: {
            BucketARN: "!GetAtt " + targetBucketId + ".Arn",
            BufferingHints: {
              IntervalInSeconds: 60,
              SizeInMBs: 50
            },
            CompressionFormat: "UNCOMPRESSED",
            Prefix: "firehose/",
            RoleARN: "!GetAtt " + deliveryRoleId + ".Arn"
          }
        }
      };
      if (targetFnId !== null) {
        status.template.Resources[node.id].Properties
          .ExtendedS3DestinationConfiguration.ProcessingConfiguration = {
            Enabled: true,
            Processors: [{
              Parameters: [{
                ParameterName: "LambdaArn",
                ParameterValue: "!GetAtt " + targetFnId + ".Arn"
              }],
              Type: "Lambda"
            }]
          }
      }
      // Create a delivery role
      status.template.Resources[deliveryRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: "Allow",
              Principal: { Service: "firehose.amazonaws.com" },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: {
                  'sts:ExternalId': "!Ref AWS::AccountId"
                }
              }
            }]
          }
        }
      };
      // Create a delivery policy for the role
      status.template.Resources[deliveryPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: "firehose_delivery_policy",
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Action: [
                's3:AbortMultipartUpload',
                's3:GetBucketLocation',
                's3:GetObject',
                's3:ListBucket',
                's3:ListBucketMultipartUploads',
                's3:PutObject'
              ],
              Resource: [
                "!GetAtt " + targetBucketId + ".Arn"
              ]
            }]
          },
          Roles: ["!Ref " + deliveryRoleId]
        }
      };
    },
    event: function () { }, // TODO
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: [
          "firehose:PutRecord",
          "firehose:PutRecordBatch"
        ],
        // Kinesis Firehose ARN syntax (can't use GetAtt)
        // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
        Resource: "!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${" + idTo + "}",
      };
    },
  },
  analyticsStream: {
    resource: function (status, node) {

      // Input resources
      var inputStreamId = null;
      var inputDeliveryStreamId = null;
      node.from.forEach(function (idFrom) {
        var node_from = status.model.nodes[idFrom];
        if (node_from.type === 'stream') {
          inputStreamId = idFrom;
        } else if (node_from.type === 'deliveryStream') {
          inputDeliveryStreamId = idFrom;
        }
      });

      // Output resource
      var outputStreamId = null;
      var outputDeliveryStreamId = null;
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        if (node_to.type === 'stream') {
          outputStreamId = idTo;
        } else if (node_to.type === 'deliveryStream') {
          outputDeliveryStreamId = idTo;
        }
      });

      var analyticsStreamRoleId = node.id + "Role";
      var analyticsStreamOutputId = node.id + "Outputs";

      status.template.Resources[node.id] = {
        Type: "AWS::KinesisAnalytics::Application",
        Properties: {
          ApplicationName: node.id,
          Inputs: [{
            NamePrefix: "exampleNamePrefix",
            InputSchema: {
              RecordColumns: [{
                Name: "example",
                SqlType: "VARCHAR(16)",
                Mapping: "$.example"
              }],
              RecordFormat: {
                RecordFormatType: "JSON",
                MappingParameters: {
                  JSONMappingParameters: {
                    RecordRowPath: "$"
                  }
                }
              }
            }
          }]
        }
      };

      if (node.description !== '') {
        status.template.Resources[node.id]
          .Properties.ApplicationDescription = node.description;
      }

      if (inputStreamId !== null) {
        status.template.Resources[node.id]
          .Properties.Inputs[0].KinesisStreamsInput = {
            ResourceARN: "!GetAtt " + inputStreamId + ".Arn",
            RoleARN: "!GetAtt " + analyticsStreamRoleId + ".Arn"
          };
      }

      if (inputDeliveryStreamId !== null) {
        status.template.Resources[node.id]
          .Properties.Inputs[0].KinesisFirehoseInput = {
            // Kinesis Firehose ARN syntax (can't use GetAtt)
            // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
            ResourceARN: "!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${" + inputDeliveryStreamId + "}",
            RoleARN: "!GetAtt " + analyticsStreamRoleId + ".Arn"
          };
      }

      status.template.Resources[analyticsStreamRoleId] = {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [{
              Effect: "Allow",
              Principal: {
                Service: "kinesisanalytics.amazonaws.com"
              },
              Action: "sts:AssumeRole"
            }]
          },
          Path: "/",
          Policies: [{
            PolicyName: "Open",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [{
                Effect: "Allow",
                Action: "*",
                Resource: "*"
              }]
            }
          }]
        }
      };

      status.template.Resources[analyticsStreamOutputId] = {
        Type: "AWS::KinesisAnalytics::ApplicationOutput",
        DependsOn: node.id,
        Properties: {
          ApplicationName: "!Ref " + node.id,
          Output: {
            Name: "exampleOutput",
            DestinationSchema: {
              RecordFormatType: "CSV"
            }
          }
        }
      };

      if (outputStreamId !== null) {
        status.template.Resources[analyticsStreamOutputId]
          .Properties.Output.KinesisStreamsOutput = {
            ResourceARN: "!GetAtt " + outputStreamId + ".Arn",
            RoleARN: "!GetAtt " + analyticsStreamRoleId + ".Arn"
          };
      }

      if (outputDeliveryStreamId !== null) {
        status.template.Resources[analyticsStreamOutputId]
          .Properties.Output.KinesisFirehoseOutput = {
            // Kinesis Firehose ARN syntax (can't use GetAtt)
            // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
            ResourceARN: "!Sub arn:aws:firehose:${AWS::Region}:${AWS::AccountId}:deliverystream/${" + outputDeliveryStreamId + "}",
            RoleARN: "!GetAtt " + analyticsStreamRoleId + ".Arn"
          };
      }

    },
    event: function () { }, // TODO
    policy: function () { } // TODO
  },
  schedule: {
    resource: function (status, node) {
      // Nothing to do
    },
    event: function (status, id, idFrom) {
      status.template.Resources[id].Properties.Events['Schedule' + idFrom] = {
        Type: "Schedule",
        Properties: {
          Schedule: "rate(5 minutes)"
        }
      };
    },
    policy: function () { } // This has no sense
  },
  topic: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::SNS::Topic"
      };
    },
    event: function (status, id, idFrom) {
      status.template.Resources[id].Properties.Events['Topic' + idFrom] = {
        Type: "SNS",
        Properties: {
          Topic: "!Ref " + idFrom
        }
      };
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: "sns:Publish",
        Resource: "!Ref " + idTo // For an SNS topic, it returns the ARN
      };
    },
  },
  fn: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::Serverless::Function",
        Properties: {
          //        FunctionName: node.id,
          Handler: node.id + "." + runtimes[status.runtime].handler,
          Runtime: status.runtime,
          CodeUri: ".",
          Policies: []
        }
      };
      if (node.description !== '') {
        status.template.Resources[node.id].Properties.Description = node.description;
      }
      status.files[node.id + '.' + runtimes[status.runtime].fileExtension] =
        runtimes[status.runtime].startingCode;
      if (node.from.length > 0) { // There are triggers for this function
        status.template.Resources[node.id].Properties.Events = {}
        node.from.forEach(function (idFrom) {
          console.log("Trigger " + idFrom + " -> " + node.id);
          renderingRules[status.model.nodes[idFrom].type].event(status, node.id, idFrom);
        });
      }
      if (node.to.length > 0) { // There are resources target of this function
        var policy = {
          Version: "2012-10-17",
          Statement: []
        };
        node.to.forEach(function (idTo) {
          console.log("Policy " + node.id + " -> " + idTo);
          policy.Statement.push(
            renderingRules[status.model.nodes[idTo].type]
              .policy(status, node.id, idTo)
          );
        });
        status.template.Resources[node.id].Properties.Policies.push(policy);
      }
    },
    event: function () { }, // Nothing to do, this is not a trigger, but a fn to fn invocation
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["lambda:Invoke", "lambda:InvokeAsync"],
        Resource: "!GetAtt " + idTo + ".Arn"
      };
    }
  },
  stepFn: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::StepFunctions::StateMachine",
        Properties: {
          // The DefinitionString is added later
          // This role is automatically created by the AWS console
          // the first time you create a state machine in a region
          RoleArn: "!Sub arn:aws:iam::${AWS::AccountId}:role/service-role/StatesExecutionRole-${AWS::Region}"
        },
      };
      var definitionString = {
        Comment: "A Hello World example",
        StartAt: "HelloWorld",
        States: {
          HelloWorld: {
            Type: "Pass",
            Result: "Hello World!",
            End: true
          }
        }
      };
      // The DefinitionString must be a string with JSON syntax within the template
      status.template.Resources[node.id].Properties.DefinitionString =
        JSON.stringify(definitionString, null, 2);
    },
    event: function () { }, // Nothing to do
    policy: function (status, id, idTo) {
      return {
        "Effect": "Allow",
        "Action": [
          "states:DescribeExecution",
          "states:GetExecutionHistory",
          "states:ListExecutions",
          "states:StartExecution",
          "states:StopExecution"
        ],
        "Resource": [
          "!Ref " + idTo
        ]
      }
    }
  },
  cognitoIdentity: {
    resource: function (status, node) {
      var cognitoUnauthRoleId = node.id + "CognitoUnauthRole";
      var cognitoUnauthPolicyId = node.id + "CognitoUnauthPolicy";
      status.template.Resources[node.id] = {
        Type: "AWS::Cognito::IdentityPool",
        Properties: {
          AllowUnauthenticatedIdentities: true // TODO Maybe this is not a secure default ???
        }
      }
      status.template.Resources[cognitoUnauthRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: "Allow",
              Principal: { Federated: "cognito-identity.amazonaws.com" },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: {
                  "cognito-identity.amazonaws.com:aud": "!Ref " + node.id
                },
                "ForAnyValue:StringLike": {
                  "cognito-identity.amazonaws.com:amr": "unauthenticated"
                }
              }
            }]
          }
        }
      }
      // Create a delivery policy for the role
      status.template.Resources[cognitoUnauthPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: "cognito_unauth_policy",
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: []
          },
          Roles: ["!Ref " + cognitoUnauthRoleId]
        }
      };
      // Output resources
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        status.template.Resources[cognitoUnauthPolicyId]
          .Properties.PolicyDocument.Statement.push(
          renderingRules[status.model.nodes[idTo].type]
            .policy(status, node.id, idTo)
          );
      });
    },
    event: function () { }, // TODO ???
    policy: function () { } // TODO ???
  },
  iotRule: {
    resource: function (status, node) {
      status.template.Resources[node.id] = {
        Type: "AWS::IoT::TopicRule",
        Properties: {
          TopicRulePayload: {
            RuleDisabled: "true", // safe choice
            Sql: "Select temp FROM 'Some/Topic' WHERE temp > 60",
            Actions: []
          }
        }
      }
      if (node.description !== '') {
        status.template.Resources[node.id].Properties.TopicRulePayload.Description = node.description;
      }
      // Output resources
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        switch (node_to.type) {
          case 'fn':
            status.template.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Lambda: {
                FunctionArn: "!GetAtt " + idTo + ".Arn"
              }
            });
            break;
          case 'iotRule': // republish
            var republishRoleId = idTo + "PublishRole";
            status.template.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Republish: {
                Topic: "Output/Topic",
                RoleArn: "!GetAtt " + republishRoleId + ".Arn"
              }
            });
            status.template.Resources[republishRoleId] = {
              Type: "AWS::IAM::Role",
              Properties: {
                AssumeRolePolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [{
                    Effect: "Allow",
                    Action: [ "sts:AssumeRole" ],
                    Principal: {
                      Service: [ "iot.amazonaws.com" ]
                    }
                  }]
                },
                Policies: [{
                  PolicyName: "publish",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [{
                      Effect: "Allow",
                      Action: "iot:Publish",
                      Resource: "!Sub arn:aws:iot:${AWS::Region}:${AWS::AccountId}:topic/Output/*"
                    }]
                  }
              }]
              }
            };
            break;
          default:
            throw "Error: connection type not supported (" + node_to.type + ")";
        }
      });
    },
    event: function () { },
    policy: function () { }
  }
};

function render(model, runtime, deployment) {
  console.log('Using SAM...');
  var files = {};
  var template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Transform: "AWS::Serverless-2016-10-31"
  };

  if (deployment) {
    template.Globals = {
      Function: {
        AutoPublishAlias: "live",
        DeploymentPreference: {
          Type: deployment
        }
      }
    }
  }

  var status = {
    model: model,
    runtime: runtime,
    files: files,
    template: template
  }

  template.Resources = {};
  for (var id in model.nodes) {
    var node = model.nodes[id];
    renderingRules[node.type].resource(status, node);
  }

  console.log(template); // Still in JSON
  console.log(JSON.stringify(template, null, 4)); // JSON -> text

  for (var r in template.Resources) {
    console.log(r + " -> YAML");
    console.log(jsyaml.safeDump(template.Resources[r], { lineWidth: 1024 }));
  }

  // Line breaks can introduce YAML syntax (e.g. >-) that will put some variables
  // (e.g. AWS::Region) between quotes.
  // Single quotes must be removed for functions (e.g. !Ref) to work.
  files['template.yaml'] = jsyaml.safeDump(template, { lineWidth: 1024 }).replace(/'(!.+)'/g, "$1");
  
  return files;
}

module.exports = render;
},{}],2:[function(require,module,exports){
"use strict";

var runtimes = {
  "nodejs6.10": {
    fileExtension: "js",
    gitignore: `# package directories
node_modules
jspm_packages

# Serverless directories
.serverless
`,
    handler: "handler",
    startingCode:
    `'use strict';

module.exports.handler = (event, context, callback) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      input: event,
    }),
  };

  callback(null, response);

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
`
  },
  "python3.6": {
    fileExtension: "py",
    gitignore: `# Distribution / packaging
.Python
env/
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
*.egg-info/
.installed.cfg
*.egg

# Serverless directories
.serverless
`,
    handler: "handler",
    startingCode:
    `import json

def handler(event, context):
    body = {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "input": event
    }

    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response

    # Use this code if you don't use the http event with the LAMBDA-PROXY integration
    """
    return {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "event": event
    }
    """
`
  }
}

var renderingRules = {
  bucket: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::S3::Bucket"
      }
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          s3: {
            bucket: idFrom,
            event: "s3:ObjectCreated:*"
          }
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Bucket' + idFrom] = {
          Type: "S3",
          Properties: {
            Bucket: { Ref: idFrom },
            Events: "s3:ObjectCreated:*"
          }
        };

        // To avoid circular dependencies with a more specific policy 
        status.template.resources.Resources[id].Properties.Policies.push('AmazonS3ReadOnlyAccess');
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: {
          "Fn::Join": [
            "",
            [
              { "Fn::GetAtt": [idTo, "Arn"] },
              "/*"
            ]
          ]
        }
      };
    },
  },
  table: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          AttributeDefinitions: [
            {
              AttributeName: "id",
              AttributeType: "S"
            },
            {
              AttributeName: "version",
              AttributeType: "N"
            }
          ],
          KeySchema: [
            {
              AttributeName: "id",
              KeyType: "HASH"
            },
            {
              AttributeName: "version",
              KeyType: "RANGE"
            }
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          },
          StreamSpecification: {
            StreamViewType: "NEW_AND_OLD_IMAGES"
          }
        }
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          stream: {
            type: "dynamodb",
            arn: { "Fn::GetAtt": [idFrom, "StreamArn"] }
          }
        });
      } else { 
        status.template.resources.Resources[id].Properties.Events['Table' + idFrom] = {
          Type: "DynamoDB",
          Properties: {
            Stream: { "Fn::GetAtt": [idFrom, "StreamArn"] },
            StartingPosition: "TRIM_HORIZON",
            BatchSize: 10
          }
        };
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:PutItem"],
        Resource: { "Fn::GetAtt": [idTo, "Arn"] }
      };
    },
  },
  api: {
    resource: function (status, node) {
      // Nothing to do, created by the API event
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          http: {
            path: "/{proxy+}",
            method: "get"
          }
        });
      } else { // Currently this doesn't execute but could if Step Functions handled events
        status.template.resources.Resources[id].Properties.Events['Api' + idFrom] = {
          Type: "Api",
          Properties: {
            Path: "/{proxy+}",
            Method: "ANY"
          }
        };
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: "execute-api:Invoke",
        Resource: {
          "Fn::Join": [
            "",
            [
              "arn:aws:execute-api:",
              { Ref: "AWS::Region" },
              ":",
              { Ref: "AWS::AccountId" },
              ":*/*/*/*"
            ]
          ]
        }
      };
    },
  },
  stream: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::Kinesis::Stream",
        Properties: {
          ShardCount: 1
        }
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          stream: {
            type: "kinesis",
            arn: { "Fn::GetAtt": [idFrom, "Arn"] }
          }
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Stream' + idFrom] = {
          Type: "Kinesis",
          Properties: {
            Stream: { "Fn::GetAtt": [idFrom, "Arn"] },
            StartingPosition: "TRIM_HORIZON",
            BatchSize: 10
          }
        };
      }      
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["kinesis:PutRecord", "kinesis:PutRecords"],
        Resource: { "Fn::GetAtt": [idTo, "Arn"] }
      };
    },
  },
  deliveryStream: {
    resource: function (status, node) {
      var targetBucketId = null;
      var targetFnId = null;
      node.to.forEach(function (idTo) {  // Target resources
        var node_to = status.model.nodes[idTo];
        if (node_to.type === 'bucket') {
          targetBucketId = idTo;
        } else if (node_to.type === 'fn') {
          targetFnId = idTo;
        }
      });
      if (targetBucketId == null) {
        console.error("Delivery Stream without a destination");
        return;
      }
      var deliveryPolicyId = node.id + "DeliveryPolicy";
      var deliveryRoleId = node.id + "DeliveryRole";
      // Create the Delivery Strem
      status.template.resources.Resources[node.id] = {
        DependsOn: [deliveryPolicyId],
        Type: 'AWS::KinesisFirehose::DeliveryStream',
        Properties: {
          ExtendedS3DestinationConfiguration: {
            BucketARN: { "Fn::GetAtt": [targetBucketId, "Arn"] },
            BufferingHints: {
              IntervalInSeconds: 60,
              SizeInMBs: 50
            },
            CompressionFormat: "UNCOMPRESSED",
            Prefix: "firehose/",
            RoleARN: { "Fn::GetAtt": [deliveryRoleId, "Arn"] }
          }
        }
      };
      if (targetFnId !== null) {
        status.template.resources.Resources[node.id].Properties
          .ExtendedS3DestinationConfiguration.ProcessingConfiguration = {
            Enabled: true,
            Processors: [{
              Parameters: [{
                ParameterName: "LambdaArn",
                ParameterValue: { Ref: `${targetFnId}LambdaFunction` },
              }],
              Type: "Lambda"
            }]
          }
      }
      // Create a delivery role
      status.template.resources.Resources[deliveryRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: "Allow",
              Principal: { Service: "firehose.amazonaws.com" },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: {
                  'sts:ExternalId': { Ref: "AWS::AccountId" }
                }
              }
            }]
          }
        }
      };
      // Create a delivery policy for the role
      status.template.resources.Resources[deliveryPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: "firehose_delivery_policy",
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Action: [
                's3:AbortMultipartUpload',
                's3:GetBucketLocation',
                's3:GetObject',
                's3:ListBucket',
                's3:ListBucketMultipartUploads',
                's3:PutObject'
              ],
              Resource: {
                "Fn::GetAtt": [targetBucketId, "Arn"]
              }
            }]
          },
          Roles: [{ Ref: deliveryRoleId }]
        }
      };
    },
    event: function () { }, // TODO
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: [
          "firehose:PutRecord",
          "firehose:PutRecordBatch"
        ],
        // Kinesis Firehose ARN syntax (can't use GetAtt)
        // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
        Resource: {
          "Fn::Join": [
            "", 
            [ 
              "arn:aws:firehose:", 
              { Ref: "AWS::Region" },
              ":",
              { Ref: "AWS::AccountId" },
              `:deliverystream/${idTo}`
            ]
          ]
        }
      };
    },
  },
  analyticsStream: {
    resource: function (status, node) {

      // Input resources
      var inputStreamId = null;
      var inputDeliveryStreamId = null;
      node.from.forEach(function (idFrom) {
        var node_from = status.model.nodes[idFrom];
        if (node_from.type === 'stream') {
          inputStreamId = idFrom;
        } else if (node_from.type === 'deliveryStream') {
          inputDeliveryStreamId = idFrom;
        }
      });

      // Output resource
      var outputStreamId = null;
      var outputDeliveryStreamId = null;
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        if (node_to.type === 'stream') {
          outputStreamId = idTo;
        } else if (node_to.type === 'deliveryStream') {
          outputDeliveryStreamId = idTo;
        }
      });

      var analyticsStreamRoleId = node.id + "Role";
      var analyticsStreamOutputId = node.id + "Outputs";

      status.template.resources.Resources[node.id] = {
        Type: "AWS::KinesisAnalytics::Application",
        Properties: {
          ApplicationName: node.id,
          Inputs: [{
            NamePrefix: "exampleNamePrefix",
            InputSchema: {
              RecordColumns: [{
                Name: "example",
                SqlType: "VARCHAR(16)",
                Mapping: "$.example"
              }],
              RecordFormat: {
                RecordFormatType: "JSON",
                MappingParameters: {
                  JSONMappingParameters: {
                    RecordRowPath: "$"
                  }
                }
              }
            }
          }]
        }
      };

      if (node.description !== '') {
        status.template.resources.Resources[node.id]
          .Properties.ApplicationDescription = node.description;
      }

      if (inputStreamId !== null) {
        status.template.resources.Resources[node.id]
          .Properties.Inputs[0].KinesisStreamsInput = {
            ResourceARN: { "Fn::GetAtt": [inputStreamId, "Arn"] },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

      if (inputDeliveryStreamId !== null) {
        status.template.resources.Resources[node.id]
          .Properties.Inputs[0].KinesisFirehoseInput = {
            // Kinesis Firehose ARN syntax (can't use GetAtt)
            // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
            ResourceARN: {
              "Fn::Join": [
                "", 
                [ 
                  "arn:aws:firehose:", 
                  { Ref: "AWS::Region" },
                  ":",
                  { Ref: "AWS::AccountId" },
                  `:deliverystream/${inputDeliveryStreamId}`
                ]
              ]
            },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

      status.template.resources.Resources[analyticsStreamRoleId] = {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [{
              Effect: "Allow",
              Principal: {
                Service: "kinesisanalytics.amazonaws.com"
              },
              Action: "sts:AssumeRole"
            }]
          },
          Path: "/",
          Policies: [{
            PolicyName: "Open",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [{
                Effect: "Allow",
                Action: "*",
                Resource: "*"
              }]
            }
          }]
        }
      };

      status.template.resources.Resources[analyticsStreamOutputId] = {
        Type: "AWS::KinesisAnalytics::ApplicationOutput",
        DependsOn: node.id,
        Properties: {
          ApplicationName: { Ref: node.id },
          Output: {
            Name: "exampleOutput",
            DestinationSchema: {
              RecordFormatType: "CSV"
            }
          }
        }
      };

      if (outputStreamId !== null) {
        status.template.resources.Resources[analyticsStreamOutputId]
          .Properties.Output.KinesisStreamsOutput = {
            ResourceARN: { "Fn::GetAtt": [outputStreamId, "Arn"] },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

      if (outputDeliveryStreamId !== null) {
        status.template.resources.Resources[analyticsStreamOutputId]
          .Properties.Output.KinesisFirehoseOutput = {
            // Kinesis Firehose ARN syntax (can't use GetAtt)
            // arn:aws:firehose:region:account-id:deliverystream/delivery-stream-name
            ResourceARN: {
              "Fn::Join": [
                "", 
                [ 
                  "arn:aws:firehose:", 
                  { Ref: "AWS::Region" },
                  ":",
                  { Ref: "AWS::AccountId" },
                  `:deliverystream/${outputDeliveryStreamId}`
                ]
              ]
            },
            RoleARN: { "Fn::GetAtt": [analyticsStreamRoleId, "Arn"] }
          };
      }

    },
    event: function () { }, // TODO
    policy: function () { } // TODO
  },
  schedule: {
    resource: function (status, node) {
      // Nothing to do
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          schedule: "rate(5 minutes)"
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Schedule' + idFrom] = {
          Type: "Schedule",
          Properties: {
            Schedule: "rate(5 minutes)"
          }
        };  
      }      
    },
    policy: function () { } // This has no sense
  },
  topic: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::SNS::Topic"
      };
    },
    event: function (status, id, idFrom) {
      if (status.model.nodes[id].type === 'fn') {
        status.template.functions[id].events.push({
          sns: idFrom
        });
      } else {
        status.template.resources.Resources[id].Properties.Events['Topic' + idFrom] = {
          Type: "SNS",
          Properties: {
            Topic: { Ref: idFrom }
          }
        };
      }
    },
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: "sns:Publish",
        Resource: { Ref: idTo } // For an SNS topic, it returns the ARN
      };
    },
  },
  fn: {
    resource: function (status, node) {
      // Check for and build a .gitignore if we haven't already
      if (!status.files[".gitignore"]) {
        status.files[".gitignore"] = runtimes[status.runtime].gitignore;
      }
      status.template.functions[node.id] = {
        handler: node.id + "." + runtimes[status.runtime].handler
      };
      if (node.description !== '') {
        status.template.functions[node.id].description = node.description;
      }
      status.files[node.id + '.' + runtimes[status.runtime].fileExtension] =
        runtimes[status.runtime].startingCode;

      if (node.from.length > 0) { // There are triggers for this function
        status.template.functions[node.id].events = []
        node.from.forEach(function (idFrom) {
          console.log("Trigger " + idFrom + " -> " + node.id);
          renderingRules[status.model.nodes[idFrom].type].event(status, node.id, idFrom);
        });
      }
      if (node.to.length > 0) { // There are resources target of this function
        var policy = {
          Version: "2012-10-17",
          Statement: []
        };
        node.to.forEach(function (idTo) {
          console.log("Policy " + node.id + " -> " + idTo);
          policy.Statement.push(
            renderingRules[status.model.nodes[idTo].type]
              .policy(status, node.id, idTo)
          );
        });

        if (status.model.nodes[node.id].type !== 'fn') {
          status.template.resources.Resources[node.id].Properties.Policies.push(policy);
        }
      }
    },
    event: function () { }, // Nothing to do, this is not a trigger, but a fn to fn invocation
    policy: function (status, id, idTo) {
      return {
        Effect: "Allow",
        Action: ["lambda:Invoke", "lambda:InvokeAsync"],
        Resource: { "Fn::GetAtt": [idTo, "Arn"] }
      };
    }
  },
  stepFn: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::StepFunctions::StateMachine",
        Properties: {
          // The DefinitionString is added later
          // This role is automatically created by the AWS console
          // the first time you create a state machine in a region
          RoleArn: {
            "Fn::Join": [
              "", 
              [ 
                "arn:aws:iam::", 
                { Ref: "AWS::AccountId" },
                ":role/service-role/StatesExecutionRole-",
                { Ref: "AWS::Region" }
              ]
            ]
          },
        },
      };
      var definitionString = {
        Comment: "A Hello World example",
        StartAt: "HelloWorld",
        States: {
          HelloWorld: {
            Type: "Pass",
            Result: "Hello World!",
            End: true
          }
        }
      };
      // The DefinitionString must be a string with JSON syntax within the template
      status.template.resources.Resources[node.id].Properties.DefinitionString =
        JSON.stringify(definitionString, null, 2);
    },
    event: function () { }, // Nothing to do
    policy: function (status, id, idTo) {
      return {
        "Effect": "Allow",
        "Action": [
          "states:DescribeExecution",
          "states:GetExecutionHistory",
          "states:ListExecutions",
          "states:StartExecution",
          "states:StopExecution"
        ],
        "Resource": [
          { Ref: idTo }
        ]
      }
    }
  },
  cognitoIdentity: {
    resource: function (status, node) {
      var cognitoUnauthRoleId = node.id + "CognitoUnauthRole";
      var cognitoUnauthPolicyId = node.id + "CognitoUnauthPolicy";
      status.template.resources.Resources[node.id] = {
        Type: "AWS::Cognito::IdentityPool",
        Properties: {
          AllowUnauthenticatedIdentities: true // TODO Maybe this is not a secure default ???
        }
      }
      status.template.resources.Resources[cognitoUnauthRoleId] = {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [{
              Effect: "Allow",
              Principal: { Federated: "cognito-identity.amazonaws.com" },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: {
                  "cognito-identity.amazonaws.com:aud": { Ref: node.id }
                },
                "ForAnyValue:StringLike": {
                  "cognito-identity.amazonaws.com:amr": "unauthenticated"
                }
              }
            }]
          }
        }
      }
      // Create a delivery policy for the role
      status.template.resources.Resources[cognitoUnauthPolicyId] = {
        Type: 'AWS::IAM::Policy',
        Properties: {
          PolicyName: "cognito_unauth_policy",
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: []
          },
          Roles: [ { Ref: cognitoUnauthRoleId } ]
        }
      };
      // Output resources
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        status.template.resources.Resources[cognitoUnauthPolicyId]
          .Properties.PolicyDocument.Statement.push(
          renderingRules[status.model.nodes[idTo].type]
            .policy(status, node.id, idTo)
          );
      });
    },
    event: function () { }, // TODO ???
    policy: function () { } // TODO ???
  },
  iotRule: {
    resource: function (status, node) {
      status.template.resources.Resources[node.id] = {
        Type: "AWS::IoT::TopicRule",
        Properties: {
          TopicRulePayload: {
            RuleDisabled: "true", // safe choice
            Sql: "Select temp FROM 'Some/Topic' WHERE temp > 60",
            Actions: []
          }
        }
      }
      if (node.description !== '') {
        status.template.resources.Resources[node.id].Properties.TopicRulePayload.Description = node.description;
      }
      // Output resources
      node.to.forEach(function (idTo) {
        var node_to = status.model.nodes[idTo];
        switch (node_to.type) {
          case 'fn':
            status.template.resources.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Lambda: {
                FunctionArn: `${idTo}LambdaFunction`
              }
            });
            break;
          case 'iotRule': // republish
            var republishRoleId = idTo + "PublishRole";
            status.template.resources.Resources[node.id].Properties.TopicRulePayload.Actions.push({
              Republish: {
                Topic: "Output/Topic",
                RoleArn: { "Fn::GetAtt": [republishRoleId, "Arn"] }
              }
            });
            status.template.resources.Resources[republishRoleId] = {
              Type: "AWS::IAM::Role",
              Properties: {
                AssumeRolePolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [{
                    Effect: "Allow",
                    Action: [ "sts:AssumeRole" ],
                    Principal: {
                      Service: [ "iot.amazonaws.com" ]
                    }
                  }]
                },
                Policies: [{
                  PolicyName: "publish",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [{
                      Effect: "Allow",
                      Action: "iot:Publish",
                      Resource: {
                        "Fn::Join": [
                          "",
                          [
                            "arn:aws:iot:",
                            { Ref: "AWS::Region" },
                            ":",
                            { Ref: "AWS::AccountId" },
                            ":topic/Outpu/*"
                          ]
                        ]
                      }
                    }]
                  }
              }]
              }
            };
            break;
          default:
            throw "Error: connection type not supported (" + node_to.type + ")";
        }
      });
    },
    event: function () { },
    policy: function () { }
  }
};

function render(model, runtime, deployment) {
  console.log('Using Serverless Framework...');
  var files = {};
  var template = {
    service: "serverless",
    provider: {
      name: "aws",
      runtime: runtime
    },
    functions: { },
    resources: { 
      Resources: { },
      Outputs: { }
    }
  };

  var status = {
    model: model,
    runtime: runtime,
    files: files,
    template: template
  }

  for (var id in model.nodes) {
    var node = model.nodes[id];
    renderingRules[node.type].resource(status, node);
  }

  console.log(template); // Still in JSON
  console.log(JSON.stringify(template, null, 4)); // JSON -> text

  for (var r in template.Resources) {
    console.log(r + " -> YAML");
    console.log(jsyaml.safeDump(template.Resources[r], { lineWidth: 1024 }));
  }

  // Line breaks can introduce YAML syntax (e.g. >-) that will put some variables
  // (e.g. AWS::Region) between quotes.
  // Single quotes must be removed for functions (e.g. Fn::GetAtt) to work.
  files['serverless.yml'] = jsyaml.safeDump(template, { lineWidth: 1024 }).replace(/'(!.+)'/g, "$1");
  
  return files;
}

module.exports = render;
},{}],3:[function(require,module,exports){
"use strict";

var sam = require('./engines/sam');
var servfrmwk = require('./engines/servfrmwk');

// Engines to build the application in different formats (AWS SAM, ...)
var engines = {
  sam: sam,
  servfrmwk: servfrmwk
};

var enginesTips = {
  sam: `You can now build this application using the AWS CLI:

aws cloudformation package --s3-bucket <BUCKET> --s3-prefix <PATH> --template-file template.yaml --output-template-file packaged.json

aws cloudformation deploy --template-file packaged.json --stack-name <STACK> --capabilities CAPABILITY_IAM
`,
  servfrmwk: `You can now build this application using the Serverless Framework:

serverless deploy`
};

var deploymentPreferenceTypes = {
  '': 'None',
  Canary10Percent5Minutes: 'Canary 10% for 5\'',
  Canary10Percent10Minutes: 'Canary 10% for 10\'',
  Canary10Percent15Minutes: 'Canary 10% for 15\'',
  Canary10Percent30Minutes: 'Canary 10% for 30\'',
  Linear10PercentEvery1Minute: 'Linear 10% every 1\'',
  Linear10PercentEvery2Minutes: 'Linear 10% every 2\'',
  Linear10PercentEvery3Minutes: 'Linear 10% every 3\'',
  Linear10PercentEvery10Minutes: 'Linear 10% every 10\'',
  AllAtOnce: 'All at Once'
};

var nodeTypes = {
  api: {
    name: 'API Gateway',
    image: './img/aws/ApplicationServices_AmazonAPIGateway.png'
  },
  cognitoIdentity: {
    name: 'Cognito Identity',
    image: './img/aws/MobileServices_AmazonCognito.png'
  },
  table: {
    name: 'DynamoDB Table',
    image: './img/aws/Database_AmazonDynamoDB_table.png'
  },
  analyticsStream: {
    name: 'Kinesis Analytics',
    image: './img/aws/Analytics_AmazonKinesis_AmazonKinesisAnalytics.png'
  },
  deliveryStream: {
    name: 'Kinesis Firehose',
    image: './img/aws/Analytics_AmazonKinesis_AmazonKinesisFirehose.png'
  },
  stream: {
    name: 'Kinesis Stream',
    image: './img/aws/Analytics_AmazonKinesis_AmazonKinesisStreams.png'
  },
  iotRule: {
    name: 'IoT Topic Rule',
    image: './img/aws/InternetOfThings_AWSIoT_rule.png'
  },
  fn: {
    name: 'Lambda Function',
    image: './img/aws/Compute_AWSLambda_LambdaFunction.png'
  },
  bucket: {
    name: 'S3 Bucket',
    image: './img/aws/Storage_AmazonS3_bucket.png'
  },
  schedule: {
    name: 'Schedule',
    image: './img/aws/ManagementTools_AmazonCloudWatch_eventtimebased.png'
  },
  topic: {
    name: 'SNS Topic',
    image: './img/aws/Messaging_AmazonSNS_topic.png'
  },
  stepFn: {
    name: 'Step Function',
    image: './img/aws/ApplicationServices_AWSStepFunctions.png'
  },
};

var nodeConnections = {
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
    fn: { action: 'transform' } // To transform data in the stream
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
  fn: {
    bucket: { action: 'read/write' },
    table: { action: 'read/write' },
    api: { action: 'invoke' },
    stream: { action: 'put' },
    deliveryStream: { action: 'put' },
    topic: { action: 'notification' },
    fn: { action: 'invoke' },
    stepFn: { action: 'activity' }
  },
  stepFn: {
    fn: { action: 'invoke' },
  },
  cognitoIdentity:  {
    fn: { action: 'authorize' },
    api: { action: 'authorize' }
  },
  iotRule: {
    fn: { action: 'invoke' },
    iotRule: { action: 'republish' }
    // These connections require an external/service role
    // stream: { action: 'put' },
    // deliveryStream: { action: 'put' },
    // table: { action: 'write' },
    // topic: { action: 'notification' },
  }
};

function getUrlParams() {
  var p = {};
  var match,
    pl     = /\+/g,  // Regex for replacing addition symbol with a space
    search = /([^&=]+)=?([^&]*)/g,
    decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
    query  = window.location.search.substring(1);
  while (match = search.exec(query))
    p[decode(match[1])] = decode(match[2]);
  return p;
}

function setSelectOptions(id, options, message) {
  var $el = $("#" + id);
  $el.empty(); // remove old options
  $el.append($("<option/>", { 'disabled': "disabled", 'selected': "selected", 'value': "" })
  .text(message));
  $.each(options, function (key, value) {
    var description;
    if (value.hasOwnProperty('name')) {
      description = value.name;
    } else {
      description = value;
    }
    $el.append($("<option/>", { 'value': key })
    .text(description));
  });
}

function setRadioOptions(id, options) {
  var $el = $("#" + id);
  $el.empty(); // remove old options
  $.each(options, function (key, value) {
    $el.append(
      $("<div/>", { 'class': 'radio' }).append(
        $("<input/>", { 'type': 'radio', 'name': id, 'value': key, 'id': key })
      ).append(
        $("<label/>", { 'class': 'radio', 'for': key }).text(value)
        )
    )
  });
}

function networkHeight() {
  var h = $(window).height() - $("#header").height() - 40;
  var w = $(".container-fluid").width() - 20;
  $("#networkContainer").height(h);
  $("#networkContainer").width(w);
}
$(document).ready(networkHeight);
$(window).resize(networkHeight).resize();

$("#mainForm").submit(function (event) {
  event.preventDefault();
});

$("#nodeForm").submit(function (event) {
  event.preventDefault();
  var id = $("#nodeId").val();
  var type = $("#nodeTypeSelect :selected").val();
  var description = $("#nodeDescription").val();
  var label = $("#nodeTypeSelect :selected").text() + '\n' + id;
  var nodeData = modalCallback['nodeModal'].data;
  var callback = modalCallback['nodeModal'].callback;
  if (type === undefined || type == "") {
    alert("Please choose a resource type.");
  } else if (id === '') {
    alert("Please provide a unique ID for the node.");
  } else if (!$("#nodeId").prop('disabled') && nodes.get(id) !== null) {
    alert("Node ID already in use.");
  } else {
    nodeData.id = id;
    nodeData.label = label;
    console.log('description = "' + description + '"');
    console.log('before nodeData.title = "' + nodeData.title + '"');
    if (description !== '') {
      nodeData.title = description; // For the tooltip
    } else if ('title' in nodeData) {
      nodeData.title = undefined;
    }
    console.log('after nodeData.title = "' + nodeData.title + '"');
    nodeData.model = {
      type: type,
      description: description
    }
    nodeData.group = type;
    nodeData.shadow = false; // quick fix for updates
    callback(nodeData);
    modalCallback['nodeModal'] = null;
    $("#nodeModal").modal('hide');
  }
});

$("#nodeModal").on('hide.bs.modal', function () {
  if (modalCallback['nodeModal'] !== null) {
    var callback = modalCallback['nodeModal'].callback;
    callback(null);
    modalCallback['nodeModal'] = null;
  }
});

$("#screenshotButton").click(function () {
  var appName = $("#appName").val();
  if (appName === '') {
    alert('Please provide an Application Name.');
    return;
  }
  var canvas = $("#networkContainer canvas")[0];
  canvas.toBlob(function(blob){
    saveAs(blob, appName + ".png");
  });
});

$("#exportButton").click(function () {
  var appName = $("#appName").val();
  if (appName === '') {
    alert('Please provide an Application Name.');
    return;
  }
  var jsonData = exportNetwork();
  var blob = new Blob([jsonData], { type: "application/json;charset=utf-8" });
  saveAs(blob, appName + ".json");
});

$("#importButton").click(function () {
  $("#importData").val('');
  $("#importModal").modal();
});

$("#importForm").submit(function (event) {
  event.preventDefault();
  var importData = $("#importData").val();
  importNetwork(JSON.parse(importData));
  $("#importModal").modal('hide');
});

$("#buildButton").click(function () {
  var appName = $("#appName").val();
  if (appName === '') {
    alert('Please provide an Application Name.');
    return;
  }
  var runtime = $("#runtime :selected").val();
  var deployment = $("#deployment :selected").val();
  var engine = $("#engine :selected").val();
  console.log("Building " + appName + " -> " + runtime + " / " + engine);
  var model = {
    app: appName,
    nodes: {}
  };
  nodes.forEach(function (n) {
    console.log(n.id + ' (' + n.model.type + ')');
    model.nodes[n.id] = {
      id: n.id,
      type: n.model.type,
      description: n.model.description,
      to: [],
      from: []
    }
    network.getConnectedNodes(n.id, 'to').forEach(function (cid) {
      console.log(n.id + ' to ' + cid);
      model.nodes[n.id]['to'].push(cid);
    });
    network.getConnectedNodes(n.id, 'from').forEach(function (cid) {
      console.log(n.id + ' from ' + cid);
      model.nodes[n.id]['from'].push(cid);
    });
  });
  console.log("Building...");

  var files = engines[engine](model, runtime, deployment);

  var zip = new JSZip();

  for (var f in files) {
    console.log("=== " + f + " ===");
    console.log(files[f]);
    zip.file(f, files[f]);
  }

  zip.generateAsync({ type: "blob" })
    .then(function (content) {
      // see FileSaver.js
      saveAs(content, model.app + ".zip");
      alert(enginesTips[engine]);
    });

});

function exportNetwork() {
  var exportData = {
    nodes: [],
    edges: []
  }

  nodes.forEach(function (n) {
    exportData.nodes.push(n);
  });

  edges.forEach(function (n) {
    exportData.edges.push(n);
  });

  var exportJson = JSON.stringify(exportData);

  return exportJson;
}

function importNetwork(importData) {

  nodes = new vis.DataSet(importData.nodes);
  edges = new vis.DataSet(importData.edges);

  networkData = {
    nodes: nodes,
    edges: edges
  };

  $("#physicsContainer").empty(); // Otherwise another config panel is added

  network = new vis.Network(networkContainer, networkData, networkOptions);
  network.redraw();
}

function getEdgeStyle(node, edgeData) {
  switch (node.model.type) {
    case 'fn':
      edgeData.color = 'Green';
      edgeData.dashes = true;
      break;
    default:
      edgeData.color = 'Blue';
  }
}

function networkAddNode(nodeData, callback) {
  modalCallback['nodeModal'] = {
    data: nodeData,
    callback: callback
  };
  $("#nodeModalTitle").text("Add Node");
  $("#nodeId").val('');
  $("#nodeDescription").val('');
  $("#nodeTypeSelect").val('');
  $("#nodeTypeSelect").prop('disabled', false);
  $("#nodeId").prop('disabled', false);
  $("#nodeId").prop('disabled', false);
  $("#nodeModal").modal();
}

function networkEditNode(nodeData, callback) {
  modalCallback['nodeModal'] = {
    data: nodeData,
    callback: callback
  };
  $("#nodeModalTitle").text("Edit Node");
  console.log(nodeData.model.type);
  $("#nodeTypeSelect").val(nodeData.model.type);
  $("#nodeTypeSelect").prop('disabled', true);
  $("#nodeId").val(nodeData.id);
  $("#nodeId").prop('disabled', true);
  $("#nodeDescription").val(nodeData.model.description);
  $("#nodeModal").modal();
}

function networkAddEdge(edgeData, callback) {
  console.log(edgeData.from + " -> " + edgeData.to);
  var nodeFrom = nodes.get(edgeData.from);
  var nodeTo = nodes.get(edgeData.to);
  if (!(nodeTo.model.type in nodeConnections[nodeFrom.model.type])) {
    var toTypeList = Object.keys(nodeConnections[nodeFrom.model.type])
      .map(function (t) { return nodeTypes[t].name });
    var fromTypeList = Object.keys(nodeConnections)
      .filter(function (t) { return nodeTo.model.type in nodeConnections[t] })
      .map(function (t) { return nodeTypes[t].name });
    var msg = "You can't connect " + nodeTypes[nodeFrom.model.type].name +
      " to " + nodeTypes[nodeTo.model.type].name + ".\n" +
      "You can connect " + nodeTypes[nodeFrom.model.type].name +
      " to " + toTypeList.join(', ') + ".\n" +
      "You can connect " + fromTypeList.join(', ')  +
      " to " + nodeTypes[nodeTo.model.type].name + ".";
    alert(msg);
  } else {
    edgeData.label = nodeConnections[nodeFrom.model.type][nodeTo.model.type].action;
    getEdgeStyle(nodeFrom, edgeData);
    if (edgeData.from === edgeData.to) {
      var r = confirm("Do you want to connect the node to itself?");
      if (r === true) {
        callback(edgeData);
      }
    } else {
      callback(edgeData);
    }
  }
}

// create an array with nodes
var nodes = new vis.DataSet();

// create an array with edges
var edges = new vis.DataSet();

var networkData = {
  nodes: nodes,
  edges: edges
};

// create a network
var networkOptions = {
  manipulation: {
    enabled: true,
    addNode: networkAddNode,
    editNode: networkEditNode,
    addEdge: networkAddEdge,
    editEdge: false // Better to delete and add again
  },
  nodes: {
    font: {
      size: 14,
      strokeWidth: 2
    }
  },
  edges: {
    arrows: 'to',
    color: 'Red',
    font: {
      size: 12,
      align: 'middle',
      strokeWidth: 2      
    }
  },
  groups: {},
  physics: {
    enabled: true,
    barnesHut: {
      avoidOverlap: 0.1
    },
    forceAtlas2Based: {
      avoidOverlap: 0.1
    },
  },
  configure: {
    enabled: true,
    container: $("#physicsContainer")[0],
    filter: 'physics',
    showButton: false
  }
}

// Filling the groups
for (var type in nodeTypes) {
  //Object.keys(nodeTypes).forEach(function (type) {
  var color;
  switch (type) {
    case 'fn':
      color = 'Green';
      break;
    default:
      color = 'Blue';
  }
  networkOptions.groups[type] = {
    shape: 'image',
    image: nodeTypes[type].image,
    mass: 1.2,
    shapeProperties: {
      useBorderWithImage: true
    },
    color: {
      border: 'White',
      background: 'White',
      highlight: {
        border: color,
        background: 'White'
      }
    }
  };
}

var networkContainer = document.getElementById('networkContainer');

var network = new vis.Network(networkContainer, networkData, networkOptions);

// To manage callbacks from modal dialogs
var modalCallback = {};

function init() {
  setSelectOptions('nodeTypeSelect', nodeTypes, "Please choose");
  setSelectOptions('deployment', deploymentPreferenceTypes, "Deployment Preference");
  var urlParams = getUrlParams();
  var importLink = urlParams['import'] || null;
  if (importLink !== null) {
    $.get(importLink, function(result){
      importNetwork(result);
    });
  }
}

window.onload = function () { init() }
},{"./engines/sam":1,"./engines/servfrmwk":2}]},{},[3]);
