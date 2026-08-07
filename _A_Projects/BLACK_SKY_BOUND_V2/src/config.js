export const CONFIG = Object.freeze({
  appName: 'Black Sky Bound v2 Demo',
  targetFps: 60,
  fixedStepMs: 1000 / 60,
  tileSize: 32,
  camera: {
    minZoom: 0.75,
    maxZoom: 2.4,
    followSharpness: 8,
    wheelZoomStep: 0.12
  },
  architecture: {
    forbidLegacyRuntime: true,
    maxProductionFileLoc: 500,
    reviewProductionFileLoc: 500,
    splitProductionFileLoc: 800
  }
});
