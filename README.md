# Serverless By Design

![Serverless by Design screenshot](https://danilop.s3.amazonaws.com/Images/serverless-by-design.png)

Serverless By Design is a visual approach to serverless development:

- An application is a network of _nodes_ (serverless resources, such as Lambda functions or S3 buckets) connected by _edges_ (their relationships, for example a trigger or a data flow)
- _Edit_ an application adding nodes and edges following an _event-driven_ design
- _Import_ a previously exported application to continue working on it
- Choose a _runtime_, and _build_ your application (for example, using AWS SAM)
- Optionally use _canary_ or _linear_ deployments for your future updates
- Edit _templates_ and code files for the final configurations before deploying the application
- _Export_ an application to save it for later use in a JSON file
- Take a _picture_ of the application architecture to have a visual representation to share
- Fine tune the _physics_ used to place nodes and edges on the screen, for example enable/disable it or choose another solver

Serverless By Design runs in the browser and doesn't need an internet connection when installed locally.

Think. Build. Repeat.

## Supported Resources

| Resource | Key |
|---|---|
| API Gateway | `api` |
| Cognito Identity Pool | `cognitoIdentity` |
| DynamoDB Table | `table` |
| EventBridge Bus | `eventBus` |
| IoT Topic Rule | `iotRule` |
| Kinesis Data Analytics | `analyticsStream` |
| Kinesis Data Firehose | `deliveryStream` |
| Kinesis Data Stream | `stream` |
| Lambda Function | `fn` |
| S3 Bucket | `bucket` |
| Schedule (CloudWatch) | `schedule` |
| SNS Topic | `topic` |
| SQS Queue | `queue` |
| Step Functions | `stepFn` |

## Build Engines

- **AWS SAM** — generates `template.yaml` with SAM intrinsic functions
- **Serverless Framework** — generates `serverless.yml` with JSON-form CloudFormation syntax

## Runtimes

- Node.js 22.x / 20.x
- Python 3.13 / 3.12

## License

Copyright (c) 2017-2026 Danilo Poccia, http://danilop.net

This code is licensed under the The MIT License (MIT). Please see the LICENSE file that accompanies this project for the terms of use.

## Installation

You need `node` (v18+) and `npm`. Install dependencies and build:

```
npm install
npm run build
```

Then preview the production build:

```
npm run preview
```

For development with hot module replacement:

```
npm run dev
```

## Development

The codebase is written in TypeScript with strict mode enabled.

**Lint** (ESLint with typescript-eslint):
```
npm run lint
npm run lint:fix
```

**Type check**:
```
npm run typecheck
```

A pre-commit hook (husky + lint-staged) runs ESLint and type checking automatically on staged files.

## Usage

Here are a few examples to help you start:

- [Basic API](?import=examples/basic-api.json)
- [S3 Processing](?import=examples/s3-processing.json)
- [Firehose Processing API](?import=examples/firehose.json)
- [Streaming Analytics](?import=examples/stream-test.json)
- [Some IoT](?import=examples/iot.json)
- [All Together Now](?import=examples/full-app.json)

## Dependencies

- [Bootstrap 5](https://getbootstrap.com)
- [Vis.js Network](https://visjs.github.io/vis-network/docs/network/)
- [Font Awesome 6](https://fontawesome.com)
- [js-yaml](https://github.com/nodeca/js-yaml)
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/)
- [JSZip](https://stuk.github.io/jszip/)
- [Vite](https://vite.dev) (build tool)
- [TypeScript](https://www.typescriptlang.org) (type system)
- [ESLint](https://eslint.org) + [typescript-eslint](https://typescript-eslint.io) (linting)
