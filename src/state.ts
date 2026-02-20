import { DataSet } from 'vis-data';
import type { AppState, VisNodeData, VisEdgeData } from './types';

const state: AppState = {
  nodes: new DataSet<VisNodeData>(),
  edges: new DataSet<VisEdgeData>(),
  networkData: null,
  network: null,
  networkContainer: null,
  networkOptions: null,
  modalCallback: {},
};

state.networkData = {
  nodes: state.nodes,
  edges: state.edges
};

export default state;
