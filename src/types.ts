import type { DataSet } from 'vis-data';
import type { Network } from 'vis-network';

// --- Domain model (built from the vis-network graph for engine consumption) ---

export interface ModelNode {
  id: string;
  type: string;
  description: string;
  to: string[];
  from: string[];
}

export interface Model {
  app: string;
  nodes: Record<string, ModelNode>;
}

// --- Engine rendering rules ---

export interface EngineStatus {
  model: Model;
  runtime: string;
  files: Record<string, string>;
  // CloudFormation templates are deeply dynamic structures consumed by AWS, not by our code.
  template: any;
}

export interface RenderingRule {
  resource(status: EngineStatus, node: ModelNode): void;
  event(status: EngineStatus, id: string, idFrom: string): void;
  policy(status: EngineStatus, id: string, idTo: string): unknown;
}

export type RenderingRules = Record<string, RenderingRule>;

export type EngineRenderFn = (model: Model, runtime: string, deployment?: string) => Record<string, string>;

// --- Node type configuration ---

export interface NodeTypeConfig {
  name: string;
  image: string;
  [key: string]: unknown;
}

export interface ConnectionAction {
  action: string;
}

export type NodeConnections = Record<string, Record<string, ConnectionAction>>;

// --- vis-network node data (stored in DataSet) ---

export interface VisNodeModel {
  type: string;
  description: string;
}

export interface VisNodeData {
  id: string;
  label?: string;
  title?: string;
  model: VisNodeModel;
  group?: string;
  shadow?: boolean;
  [key: string]: unknown;
}

export interface VisEdgeData {
  id?: string;
  from: string;
  to: string;
  label?: string;
  color?: { color: string };
  dashes?: boolean;
  [key: string]: unknown;
}

// --- Application state ---

export interface AppState {
  nodes: DataSet<VisNodeData>;
  edges: DataSet<VisEdgeData>;
  networkData: { nodes: DataSet<VisNodeData>; edges: DataSet<VisEdgeData> } | null;
  network: Network | null;
  networkContainer: HTMLElement | null;
  networkOptions: Record<string, unknown> | null;
  modalCallback: Record<string, { data: VisNodeData; callback: (data: VisNodeData | null) => void } | null>;
}

// --- Import/Export data ---

export interface NetworkExportData {
  nodes: VisNodeData[];
  edges: VisEdgeData[];
}
