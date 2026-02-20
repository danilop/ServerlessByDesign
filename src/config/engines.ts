import type { EngineRenderFn } from '../types';
import sam from '../engines/sam';
import servfrmwk from '../engines/servfrmwk';

export const engines: Record<string, EngineRenderFn> = {
  sam: sam,
  servfrmwk: servfrmwk
};

export const enginesTips: Record<string, string> = {
  sam: `You can now build this application using the AWS SAM CLI:

sam build
sam deploy --guided
`,
  servfrmwk: `You can now build this application using the Serverless Framework:

serverless deploy`
};

export const deploymentPreferenceTypes: Record<string, string> = {
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
