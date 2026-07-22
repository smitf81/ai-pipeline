// Add these functions inside SceneManager before the return object:
function getCamera(){ return camera; }
function getOrbitTarget(){ return orbitTarget; }
function getRendererDomElement(){ return renderer?.domElement || document.getElementById('three-canvas'); }

// Then add these to the SceneManager return object:
getCamera, getOrbitTarget, getRendererDomElement,

// Then add these to window.EDITOR.scene:
getCamera(){ return SceneManager.getCamera(); },
getOrbitTarget(){ return SceneManager.getOrbitTarget(); },
getRendererDomElement(){ return SceneManager.getRendererDomElement(); },
focusSelected(){ return SceneManager.focusSelected(); },
