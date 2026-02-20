import { Network } from 'vis-network';
import state from '../state';
import { nodeTypes } from '../config/nodeTypes';
import { networkAddNode, networkEditNode, networkAddEdge } from '../ui/modals';

export function createNetworkOptions(): Record<string, unknown> {
  const options: Record<string, unknown> = {
    manipulation: {
      enabled: true,
      addNode: networkAddNode,
      editNode: networkEditNode,
      addEdge: networkAddEdge,
      editEdge: false
    },
    nodes: {
      font: {
        size: 14,
        strokeWidth: 2
      }
    },
    edges: {
      arrows: 'to',
      color: {
        color: 'red',
        highlight: 'red'
      },
      font: {
        size: 12,
        align: 'middle',
        strokeWidth: 2
      }
    },
    groups: {} as Record<string, unknown>,
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
      container: document.getElementById('physicsContainer'),
      filter: 'physics',
      showButton: false
    }
  };

  // Populate groups from nodeTypes
  const groups = options.groups as Record<string, unknown>;
  for (const type in nodeTypes) {
    const color = type === 'fn' ? 'green' : 'blue';
    groups[type] = {
      shape: 'image',
      image: nodeTypes[type].image,
      mass: 1.2,
      shapeProperties: {
        useBorderWithImage: true
      },
      color: {
        border: 'white',
        background: 'white',
        highlight: {
          border: color,
          background: 'white'
        }
      }
    };
  }

  return options;
}

export function initNetwork(): void {
  state.networkContainer = document.getElementById('networkContainer');
  state.networkOptions = createNetworkOptions();
  state.network = new Network(state.networkContainer!, state.networkData!, state.networkOptions);
}
