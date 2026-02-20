import * as bootstrap from 'bootstrap';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import state from '../state';
import { engines, enginesTips } from '../config/engines';
import { importNetwork, exportNetwork } from '../network/importExport';
import { showToast } from './notify';
import type { Model } from '../types';

export function initToolbarHandlers(): void {
  (document.getElementById('screenshotButton') as HTMLElement).addEventListener('click', () => {
    const appName = (document.getElementById('appName') as HTMLInputElement).value;
    if (appName === '') {
      showToast('Please provide an Application Name.', 'warning');
      return;
    }
    const canvas = document.querySelector('#networkContainer canvas') as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      saveAs(blob!, appName + '.png');
    });
  });

  (document.getElementById('exportButton') as HTMLElement).addEventListener('click', () => {
    const appName = (document.getElementById('appName') as HTMLInputElement).value;
    if (appName === '') {
      showToast('Please provide an Application Name.', 'warning');
      return;
    }
    const jsonData = exportNetwork();
    const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
    saveAs(blob, appName + '.json');
  });

  (document.getElementById('importButton') as HTMLElement).addEventListener('click', () => {
    (document.getElementById('importData') as HTMLTextAreaElement).value = '';
    new bootstrap.Modal(document.getElementById('importModal') as HTMLElement).show();
  });

  (document.getElementById('importForm') as HTMLFormElement).addEventListener('submit', (event: Event) => {
    event.preventDefault();
    const importData = (document.getElementById('importData') as HTMLTextAreaElement).value;
    let parsed;
    try {
      parsed = JSON.parse(importData);
    } catch (e) {
      showToast('Invalid JSON: ' + (e as Error).message, 'error');
      return;
    }
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      showToast('Invalid format: expected { "nodes": [...], "edges": [...] }', 'error');
      return;
    }
    importNetwork(parsed);
    bootstrap.Modal.getInstance(document.getElementById('importModal') as HTMLElement)!.hide();
  });

  const engineEl = document.getElementById('engine') as HTMLSelectElement;
  const deploymentEl = document.getElementById('deployment') as HTMLSelectElement;

  engineEl.addEventListener('change', () => {
    const isServfrmwk = engineEl.value === 'servfrmwk';
    deploymentEl.disabled = isServfrmwk;
    if (isServfrmwk) deploymentEl.selectedIndex = 0;
  });

  (document.getElementById('buildButton') as HTMLElement).addEventListener('click', () => {
    const appName = (document.getElementById('appName') as HTMLInputElement).value;
    if (appName === '') {
      showToast('Please provide an Application Name.', 'warning');
      return;
    }
    const runtime = (document.getElementById('runtime') as HTMLSelectElement).value;
    const deployment = (document.getElementById('deployment') as HTMLSelectElement).value;
    const engine = (document.getElementById('engine') as HTMLSelectElement).value;

    const model: Model = {
      app: appName,
      nodes: {}
    };
    state.nodes.forEach((n) => {
      model.nodes[n.id] = {
        id: n.id,
        type: n.model.type,
        description: n.model.description,
        to: [],
        from: []
      };
      state.network!.getConnectedNodes(n.id, 'to').forEach((cid) => {
        model.nodes[n.id].to.push(cid as string);
      });
      state.network!.getConnectedNodes(n.id, 'from').forEach((cid) => {
        model.nodes[n.id].from.push(cid as string);
      });
    });

    let files: Record<string, string>;
    try {
      files = engines[engine](model, runtime, deployment);
    } catch (e) {
      showToast('Build failed: ' + (e as Error).message, 'error');
      return;
    }

    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) {
      zip.file(name, content);
    }

    zip.generateAsync({ type: 'blob' })
      .then((content) => {
        saveAs(content, model.app + '.zip');
        showToast(enginesTips[engine], 'success');
      });
  });
}
