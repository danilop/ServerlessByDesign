import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import state from '../state';
import type { VisNodeData, VisEdgeData, NetworkExportData } from '../types';

export function exportNetwork(): string {
  const exportData: NetworkExportData = {
    nodes: [],
    edges: []
  };

  const positions = state.network!.getPositions();

  state.nodes.forEach((n) => {
    const pos = positions[n.id];
    if (pos) {
      exportData.nodes.push({ ...n, x: pos.x, y: pos.y });
    } else {
      exportData.nodes.push(n);
    }
  });

  state.edges.forEach((e) => {
    exportData.edges.push(e);
  });

  return JSON.stringify(exportData);
}

export function importNetwork(importData: NetworkExportData): void {
  state.network!.destroy();

  state.nodes = new DataSet<VisNodeData>(importData.nodes);
  state.edges = new DataSet<VisEdgeData>(importData.edges);

  state.networkData = {
    nodes: state.nodes,
    edges: state.edges
  };

  (document.getElementById('physicsContainer') as HTMLElement).innerHTML = '';

  state.network = new Network(state.networkContainer!, state.networkData, state.networkOptions!);
  state.network.redraw();
}
