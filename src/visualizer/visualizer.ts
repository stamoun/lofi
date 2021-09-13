// import { volume } from '../../build/Release/volume.node';
// import { visualizations } from '../visualizations/visualizations.js';
import { ipcRenderer } from 'electron';
import Store from 'electron-store';

const store = new Store();
let activeVisId = store.get('settings.lofi.visualization');

// FIXME fix this shiz
// const byeVisualization = function () {
//   let canvas = document.getElementsByTagName('canvas')[0];
//   if (canvas) {
//     let gl = canvas.getContext('webgl');
//     if (gl.getExtension('WEBGL_lose_context')) {
//       gl.getExtension('WEBGL_lose_context').loseContext();
//     }
//     document.body.removeChild(canvas);
//   }
// };

// const doVisualization = function (vis: Function) {
//   byeVisualization();
//   let canvas = document.createElement('canvas');
//   document.body.appendChild(canvas);
//   window.addEventListener('resize', () => {
//     canvas.width = window.innerWidth / 2;
//     canvas.height = window.innerHeight / 2;
//   });
//   canvas.width = window.innerWidth / 2;
//   canvas.height = window.innerHeight / 2;

//   vis(canvas, function () {
//     return { volume };
//   });
// };

ipcRenderer.on('set-visualization', function (event: Event, id: number) {
  // if (typeof id !== 'undefined' && id !== activeVisId) {
  //   activeVisId = id;
  //   doVisualization(visualizations[activeVisId].visualize);
  // }
});

// doVisualization(visualizations[activeVisId].visualize);
// TODO remove
console.log('activeVisId', activeVisId);
