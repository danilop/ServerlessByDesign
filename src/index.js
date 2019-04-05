"use strict";

import $ from 'jquery';
//window.jQuery = $;
//window.$ = $;

import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

import { Network } from 'vis/index-network';
import { DataSet } from 'vis/index-timeline-graph2d';
import 'vis/dist/vis-network.min.css';

var JSZip = require("jszip");
import { saveAs } from 'file-saver';

const sam = require('./engines/sam');
const servfrmwk = require('./engines/servfrmwk');

// Engines to build the application in different formats (AWS SAM, ...)
const engines = {
  sam: sam,
  servfrmwk: servfrmwk
};

const enginesTips = {
  sam: `You can now build this application using the AWS SAM CLI:

sam package --s3-bucket <BUCKET> --output-template-file packaged.json

sam deploy --template-file packaged.json --stack-name <STACK> --capabilities CAPABILITY_IAM
`,
  servfrmwk: `You can now build this application using the Serverless Framework:

serverless deploy`
};

const deploymentPreferenceTypes = {
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

const nodeTypes = {
  api: {
    name: 'API Gateway',
    image: './img/aws/Amazon-API-Gateway.png'
  },
  cognitoIdentity: {
    name: 'Cognito Identity',
    image: './img/aws/Amazon-Cognito.png'
  },
  table: {
    name: 'DynamoDB Table',
    image: './img/aws/Amazon-DynamoDB_Table.png'
  },
  analyticsStream: {
    name: 'Kinesis Data Analytics',
    image: './img/aws/Amazon-Kinesis-Data-Analytics.png'
  },
  deliveryStream: {
    name: 'Kinesis Data Firehose',
    image: './img/aws/Amazon-Kinesis-Data-Firehose.png'
  },
  stream: {
    name: 'Kinesis Data Stream',
    image: './img/aws/Amazon-Kinesis-Data-Streams.png'
  },
  iotRule: {
    name: 'IoT Topic Rule',
    image: './img/aws/IoT_Rule.png'
  },
  fn: {
    name: 'Lambda Function',
    image: './img/aws/AWS-Lambda_Function.png'
  },
  bucket: {
    name: 'S3 Bucket',
    image: './img/aws/Amazon-S3_Bucket.png'
  },
  schedule: {
    name: 'Schedule',
    image: './img/aws/Amazon-CloudWatch_Event-Time-Based.png'
  },
  topic: {
    name: 'SNS Topic',
    image: './img/aws/Amazon-SNS_Topic.png'
  },
  stepFn: {
    name: 'Step Function',
    image: './img/aws/AWS-Step-Functions.png'
  },
};

const nodeConnections = {
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
  let p = {};
  let match,
    pl     = /\+/g,  // Regex for replacing addition symbol with a space
    search = /([^&=]+)=?([^&]*)/g,
    decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
    query  = window.location.search.substring(1);
  while (match = search.exec(query))
    p[decode(match[1])] = decode(match[2]);
  return p;
}

function setSelectOptions(id, options, message) {
  let $el = $("#" + id);
  $el.empty(); // remove old options
  $el.append($("<option/>", { 'disabled': "disabled", 'selected': "selected", 'value': "" })
  .text(message));
  $.each(options, function (key, value) {
    let description;
    if (value.hasOwnProperty('name')) {
      description = value.name;
    } else {
      description = value;
    }
    $el.append($("<option/>", { 'value': key })
    .text(description));
  });
}

/*
function setRadioOptions(id, options) {
  let $el = $("#" + id);
  $el.empty(); // remove old options
  $.each(options, function (key, value) {
    $el.append(
      $("<div/>", { 'class': 'radio' }).append(
        $("<input/>", { 'type': 'radio', 'name': id, 'value': key, 'id': key })
      ).append(
        $("<label/>", { 'class': 'radio', 'for': key }).text(value)
        )
    );
  });
}
*/

function networkHeight() {
  const h = $(window).height() - $("#header").height() - 40;
  const w = $(".container-fluid").width() - 20;
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
    if (description !== '') {
      nodeData.title = description; // For the tooltip
    } else if ('title' in nodeData) {
      nodeData.title = undefined;
    }
    nodeData.model = {
      type: type,
      description: description
    };
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
    };
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
  };

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

  nodes = new DataSet(importData.nodes);
  edges = new DataSet(importData.edges);

  networkData = {
    nodes: nodes,
    edges: edges
  };

  $("#physicsContainer").empty(); // Otherwise another config panel is added

  network = new Network(networkContainer, networkData, networkOptions);
  network.redraw();
}

function getEdgeStyle(node, edgeData) {
  switch (node.model.type) {
    case 'fn':
      edgeData.color = { color: 'green' };
      edgeData.dashes = true;
      break;
    default:
      edgeData.color = { color: 'blue' };
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
    console.log(edgeData);
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
var nodes = new DataSet();

// create an array with edges
var edges = new DataSet();

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
};

// Filling the groups
for (let type in nodeTypes) {
  let color;
  switch (type) {
    case 'fn':
      color = 'green';
      break;
    default:
      color = 'blue';
  }
  networkOptions.groups[type] = {
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

var networkContainer = document.getElementById('networkContainer');

var network = new Network(networkContainer, networkData, networkOptions);

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

window.onload = function () { init() };