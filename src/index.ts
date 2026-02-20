import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'vis-network/styles/vis-network.css';

import { nodeTypes } from './config/nodeTypes';
import { deploymentPreferenceTypes } from './config/engines';
import { runtimeTypes } from './config/runtimes';
import { setSelectOptions, networkHeight } from './ui/layout';
import { initModalHandlers } from './ui/modals';
import { initToolbarHandlers } from './ui/toolbar';
import { initNetwork } from './network/graph';
import { importNetwork } from './network/importExport';
import { showToast } from './ui/notify';

// Initialize vis-network
initNetwork();

// Set up layout sizing
window.addEventListener('resize', networkHeight);
networkHeight();

// Wire up UI event handlers
initModalHandlers();
initToolbarHandlers();

// Populate dropdowns and handle URL import
setSelectOptions('nodeTypeSelect', nodeTypes, 'Please choose');
setSelectOptions('runtime', runtimeTypes);
setSelectOptions('deployment', deploymentPreferenceTypes, 'Deployment Preference');

const importLink = new URLSearchParams(window.location.search).get('import');
if (importLink !== null) {
  fetch(importLink)
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((result) => {
      if (!result || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
        showToast('Invalid format: expected { "nodes": [...], "edges": [...] }', 'error');
        return;
      }
      importNetwork(result);
    })
    .catch((e: Error) => {
      showToast('Failed to load example: ' + e.message, 'error');
    });
}
