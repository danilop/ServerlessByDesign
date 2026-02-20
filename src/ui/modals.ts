import * as bootstrap from 'bootstrap';
import state from '../state';
import { nodeTypes, nodeConnections } from '../config/nodeTypes';
import { showToast, showConfirm } from './notify';
import type { VisNodeData, VisEdgeData } from '../types';

function getEdgeStyle(node: VisNodeData, edgeData: VisEdgeData): void {
  switch (node.model.type) {
    case 'fn':
      edgeData.color = { color: 'green' };
      edgeData.dashes = true;
      break;
    default:
      edgeData.color = { color: 'blue' };
  }
}

export function networkAddNode(nodeData: VisNodeData, callback: (data: VisNodeData | null) => void): void {
  state.modalCallback['nodeModal'] = {
    data: nodeData,
    callback: callback
  };
  (document.getElementById('nodeModalTitle') as HTMLElement).textContent = 'Add Node';
  (document.getElementById('nodeId') as HTMLInputElement).value = '';
  (document.getElementById('nodeDescription') as HTMLTextAreaElement).value = '';
  (document.getElementById('nodeTypeSelect') as HTMLSelectElement).value = '';
  (document.getElementById('nodeTypeSelect') as HTMLSelectElement).disabled = false;
  (document.getElementById('nodeId') as HTMLInputElement).disabled = false;
  new bootstrap.Modal(document.getElementById('nodeModal') as HTMLElement).show();
}

export function networkEditNode(nodeData: VisNodeData, callback: (data: VisNodeData | null) => void): void {
  state.modalCallback['nodeModal'] = {
    data: nodeData,
    callback: callback
  };
  (document.getElementById('nodeModalTitle') as HTMLElement).textContent = 'Edit Node';
  (document.getElementById('nodeTypeSelect') as HTMLSelectElement).value = nodeData.model.type;
  (document.getElementById('nodeTypeSelect') as HTMLSelectElement).disabled = true;
  (document.getElementById('nodeId') as HTMLInputElement).value = nodeData.id;
  (document.getElementById('nodeId') as HTMLInputElement).disabled = true;
  (document.getElementById('nodeDescription') as HTMLTextAreaElement).value = nodeData.model.description;
  new bootstrap.Modal(document.getElementById('nodeModal') as HTMLElement).show();
}

export function networkAddEdge(edgeData: VisEdgeData, callback: (data: VisEdgeData) => void): void {
  const nodeFrom = state.nodes.get(edgeData.from) as VisNodeData;
  const nodeTo = state.nodes.get(edgeData.to) as VisNodeData;
  if (!(nodeTo.model.type in nodeConnections[nodeFrom.model.type])) {
    const toTypeList = Object.keys(nodeConnections[nodeFrom.model.type])
      .map((t) => nodeTypes[t].name);
    const fromTypeList = Object.keys(nodeConnections)
      .filter((t) => nodeTo.model.type in nodeConnections[t])
      .map((t) => nodeTypes[t].name);
    const msg = "You can't connect " + nodeTypes[nodeFrom.model.type].name +
      ' to ' + nodeTypes[nodeTo.model.type].name + '.\n' +
      'You can connect ' + nodeTypes[nodeFrom.model.type].name +
      ' to ' + toTypeList.join(', ') + '.\n' +
      'You can connect ' + fromTypeList.join(', ') +
      ' to ' + nodeTypes[nodeTo.model.type].name + '.';
    showToast(msg, 'error');
  } else {
    edgeData.label = nodeConnections[nodeFrom.model.type][nodeTo.model.type].action;
    getEdgeStyle(nodeFrom, edgeData);
    if (edgeData.from === edgeData.to) {
      showConfirm('Do you want to connect the node to itself?').then((confirmed) => {
        if (confirmed) callback(edgeData);
      });
    } else {
      callback(edgeData);
    }
  }
}

export function initModalHandlers(): void {
  (document.getElementById('mainForm') as HTMLFormElement).addEventListener('submit', (event: Event) => {
    event.preventDefault();
  });

  (document.getElementById('nodeForm') as HTMLFormElement).addEventListener('submit', (event: Event) => {
    event.preventDefault();
    const nodeIdEl = document.getElementById('nodeId') as HTMLInputElement;
    const nodeTypeSelectEl = document.getElementById('nodeTypeSelect') as HTMLSelectElement;
    const nodeDescriptionEl = document.getElementById('nodeDescription') as HTMLTextAreaElement;
    const id = nodeIdEl.value;
    const selectedOption = nodeTypeSelectEl.options[nodeTypeSelectEl.selectedIndex];
    const type = selectedOption ? selectedOption.value : '';
    const description = nodeDescriptionEl.value;
    const label = (selectedOption ? selectedOption.text : '') + '\n' + id;
    const nodeData = state.modalCallback['nodeModal']!.data;
    const callback = state.modalCallback['nodeModal']!.callback;
    if (type === '') {
      showToast('Please choose a resource type.', 'warning');
    } else if (id === '') {
      showToast('Please provide a unique ID for the node.', 'warning');
    } else if (!nodeIdEl.disabled && state.nodes.get(id) !== null) {
      showToast('Node ID already in use.', 'warning');
    } else {
      nodeData.id = id;
      nodeData.label = label;
      if (description !== '') {
        nodeData.title = description;
      } else if ('title' in nodeData) {
        nodeData.title = undefined;
      }
      nodeData.model = {
        type: type,
        description: description
      };
      nodeData.group = type;
      nodeData.shadow = false;
      callback(nodeData);
      state.modalCallback['nodeModal'] = null;
      bootstrap.Modal.getInstance(document.getElementById('nodeModal') as HTMLElement)!.hide();
    }
  });

  (document.getElementById('nodeModal') as HTMLElement).addEventListener('hide.bs.modal', () => {
    if (state.modalCallback['nodeModal'] !== null) {
      const callback = state.modalCallback['nodeModal']!.callback;
      callback(null);
      state.modalCallback['nodeModal'] = null;
    }
  });
}
