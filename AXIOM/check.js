
const EventBus = (() => {
  const subs = {};
  return {
    on(e, fn){ (subs[e] = subs[e]||[]).push(fn) },
    off(e, fn){ subs[e] = (subs[e]||[]).filter(f=>f!==fn) },
    emit(e, d){ (subs[e]||[]).forEach(fn=>fn(d)) }
  };
})();

const PluginRegistry = (() => {
  const plugins = new Map();
  return {
    register(id, def){
      if(plugins.has(id)) return notify('warn',`Plugin '${id}' already registered`);
      plugins.set(id, {...def, id, active: def.active !== false});
      if(def.init) try { def.init(EDITOR); } catch(e){ cliPrint('err',`Plugin init error: ${e.message}`); }
      EventBus.emit('plugin:registered', {id, def});
      renderPluginList();
      notify('ok', `Plugin '${id}' registered`);
    },
    unregister(id){
      const p = plugins.get(id);
      if(!p) return;
      if(p.destroy) try { p.destroy(); } catch(e){}
      plugins.delete(id);
      EventBus.emit('plugin:unregistered', {id});
      renderPluginList();
    },
    get(id){ return plugins.get(id) },
    list(){ return [...plugins.values()] },
    toggle(id){
      const p = plugins.get(id);
      if(!p) return;
      p.active = !p.active;
      if(p.active && p.init) try{ p.init(EDITOR); }catch(e){}
      if(!p.active && p.suspend) try{ p.suspend(); }catch(e){}
      renderPluginList();
    }
  };
})();

const ModelBus = (() => {
  let current = null;
  let available = [];
  const endpoints = [
    { name:'Ollama', url:'http://127.0.0.1:11434', type:'ollama-native' },
    { name:'LM Studio', url:'http://localhost:1234/v1', type:'openai-compat' },
    { name:'Claude API', url:'https://api.anthropic.com/v1', type:'anthropic' },
  ];

  async function scanEndpoint(ep) {
  try {
    const modelsUrl = ep.type === 'ollama-native'
      ? `${ep.url}/api/tags`
      : `${ep.url}/models`;

    const r = await fetch(modelsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });

    if (!r.ok) return null;

    const d = await r.json();

    if (ep.type === 'ollama-native') {
      return {
        ...ep,
        models: (d.models || []).map(m => ({ id: m.name }))
      };
    }

    return { ...ep, models: d.data || [] };
  } catch (e) {
    return null;
  }
}

  async function scan(){
    updateModelUI('scanning');
    cliPrint('info', 'Scanning for available model endpoints...');
    const results = [];
    for(const ep of endpoints){
      const r = await scanEndpoint(ep);
      if(r){ results.push(r); cliPrint('ok', `Found: ${ep.name} (${(r.models||[]).length} models)`); }
      else { cliPrint('warn', `Offline: ${ep.name}`); }
    }
    available = results;
    if(results.length > 0){
      const firstModel = results[0].models?.[0]?.id || results[0].name;
      current = { endpoint: results[0], model: firstModel };
      updateModelUI('online');
      cliPrint('ok', `Active: ${results[0].name} / ${firstModel}`);
      notify('ok', `Model connected: ${firstModel}`);
    } else {
      updateModelUI('offline');
      cliPrint('warn', 'No local endpoints found. Using Anthropic API fallback.');
      current = { endpoint: { name:'Claude API', url:'https://api.anthropic.com/v1', type:'anthropic' }, model:'claude-sonnet-4-20250514' };
      updateModelUI('online');
    }
    updateChatModelBadge();
    EventBus.emit('model:ready', current);
  }

  function updateModelUI(state){
    const dot = document.getElementById('model-dot');
    const label = document.getElementById('model-label');
    dot.className = 'model-dot ' + state;
    if(state === 'scanning') label.textContent = 'scanning...';
    else if(state === 'offline') label.textContent = 'no model';
    else if(state === 'online') label.textContent = current ? (current.model||current.endpoint.name) : 'online';
  }

  function updateChatModelBadge(){
    const b = document.getElementById('chat-model-badge');
    if(b && current) b.textContent = current.model || current.endpoint.name;
  }

  async function complete(messages, opts={}){
    if(!current) throw new Error('No model selected');
    const ep = current.endpoint;

    if (ep.type === 'ollama-native') {
  const r = await fetch(`${ep.url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: current.model,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        ...messages
      ],
      stream: false,
      options: {
        num_ctx: 4096
      }
    })
  });

  if (!r.ok) {
    const e = await r.text();
    throw new Error(e);
  }

  const d = await r.json();
  return d.message?.content || '';
}
    if(ep.type === 'anthropic'){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'anthropic-version':'2023-06-01', 'x-api-key': opts.apiKey||'' },
        body: JSON.stringify({
          model: current.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || 2048,
          system: opts.system || 'You are an expert game developer and AI co-pilot inside AXIOM, an AI-native game editor. Be concise, technical, and helpful. When generating code, use working JavaScript/Three.js patterns.',
          messages
        })
      });
      if(!r.ok){ const e = await r.text(); throw new Error(e); }
      const d = await r.json();
      return d.content?.[0]?.text || '';
    } else {
      const sysMsgs = opts.system ? [{ role:'system', content: opts.system }] : [];
      const r = await fetch(`${ep.url}/chat/completions`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model: current.model,
          messages: [...sysMsgs, ...messages],
          max_tokens: opts.max_tokens || 2048,
          stream: false
        })
      });
      if(!r.ok){ const e = await r.text(); throw new Error(e); }
      const d = await r.json();
      return d.choices?.[0]?.message?.content || '';
    }
  }

  return { scan, complete, getCurrent: ()=>current, getAvailable: ()=>available,
    setModel(ep, model){ current = {endpoint:ep, model}; updateModelUI('online'); updateChatModelBadge(); EventBus.emit('model:changed', current); }
  };
})();

const SceneManager = (() => {
  let renderer, scene, camera, orbitTarget = new THREE.Vector3();
  let objects = new Map(); let oidCounter = 0;
  let selectedId = null;
  let wireframe = false, gridVisible = true;
  let gridHelper, axesHelper;
  let isDragging = false, lastMouse = { x:0, y:0 };
  let mouseButton = -1;
  let raycaster = new THREE.Raycaster();
  let mouse2D = new THREE.Vector2();
  let frameCount = 0, fpsTime = 0, fps = 0;
  let activeTool = 'select';

  function init(){
    const canvas = document.getElementById('three-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0a0b);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0b, 0.018);

    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(6, 5, 10);
    camera.lookAt(0,0,0);

    gridHelper = new THREE.GridHelper(40, 40, 0x222226, 0x1a1a1e);
    scene.add(gridHelper);

    axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x7c8cff, 1.2);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xff5c7d, 0.4);
    fillLight.position.set(-5, 2, -5);
    scene.add(fillLight);

    addMesh('cube', { name:'Cube_0', x:0, y:0.5, z:0 });

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', ()=>{ isDragging=false; mouseButton=-1; });
    canvas.addEventListener('wheel', onWheel, {passive:true});
    canvas.addEventListener('contextmenu', e=>e.preventDefault());
    document.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(loop);
  }

  function resize(){
    const vp = document.getElementById('viewport');
    const w = vp.clientWidth, h = vp.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  }

  function loop(t){
    requestAnimationFrame(loop);
    frameCount++;
    const now = performance.now();
    if(now - fpsTime > 500){ fps = Math.round(frameCount*1000/(now-fpsTime)); frameCount=0; fpsTime=now; }
    renderer.render(scene, camera);
    updateGizmo();
    updateInfoOverlay();
  }

  function addMesh(type, opts={}){
    let geo;
    const id = 'obj_' + (++oidCounter);
    const name = opts.name || `${type}_${oidCounter}`;
    const color = opts.color || 0x7c5cfc;

    if(type === 'cube') geo = new THREE.BoxGeometry(1,1,1);
    else if(type === 'sphere') geo = new THREE.SphereGeometry(0.5, 32, 16);
    else if(type === 'plane') geo = new THREE.PlaneGeometry(2,2);
    else if(type === 'cylinder') geo = new THREE.CylinderGeometry(0.4,0.4,1,32);
    else if(type === 'cone') geo = new THREE.ConeGeometry(0.5,1,32);
    else { geo = new THREE.BoxGeometry(1,1,1); }

    if(type === 'plane') geo.rotateX(-Math.PI/2);

    const mat = new THREE.MeshStandardMaterial({ color, metalness:0.2, roughness:0.7, wireframe });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(opts.x||0, opts.y||0, opts.z||0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { id, name, type };
    scene.add(mesh);
    objects.set(id, { id, name, type, mesh, active:true });
    EntityRegistry.createEntity({
  id,
  name,
  type: "visual_object",
  transform: {
    position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
    rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
    scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
  },
  components: ["Renderable", "Editable", "Transform"],
  capabilities: ["select", "move", "delete", "duplicate"],
  provenance: { createdBy: "editor.addMesh" }
});
    renderSceneTree();
    updateVpObjects();
    EventBus.emit('scene:objectAdded', {id, name, type});
    return id;
  }

  function addLight(type, opts={}){
    const id = 'obj_' + (++oidCounter);
    const name = opts.name || `${type}_${oidCounter}`;
    let light;
    if(type === 'light-point') light = new THREE.PointLight(0xffffff, 1, 10);
    else if(type === 'light-dir'){ light = new THREE.DirectionalLight(0xffffff, 1); light.castShadow=true; }
    else light = new THREE.PointLight(0xffffff,1,10);
    light.position.set(opts.x||0, opts.y||3, opts.z||0);
    light.userData = { id, name, type };
    scene.add(light);

    const hgeo = new THREE.SphereGeometry(0.1, 8, 4);
    const hmat = new THREE.MeshBasicMaterial({ color: 0xffc53d });
    const helper = new THREE.Mesh(hgeo, hmat);
    helper.position.copy(light.position);
    helper.userData = { id, name:'_helper_'+id, isHelper:true };
    scene.add(helper);

    objects.set(id, { id, name, type, light, helper, active:true });
    renderSceneTree();
    updateVpObjects();
    EventBus.emit('scene:objectAdded', {id, name, type});
    return id;
  }

  function selectObject(id){
    if(selectedId && objects.has(selectedId)){
      const prev = objects.get(selectedId);
      if(prev.mesh){ prev.mesh.material.emissive = new THREE.Color(0x000000); }
    }
    selectedId = id;
    if(id && objects.has(id)){
      const obj = objects.get(id);
      if(obj.mesh){ obj.mesh.material.emissive = new THREE.Color(0x7c5cfc); obj.mesh.material.emissiveIntensity = 0.15; }
      document.getElementById('sb-selected').textContent = obj.name;
      renderPropsPanel(obj);
    } else {
      document.getElementById('sb-selected').textContent = 'No Selection';
      document.getElementById('props-content').innerHTML = '<div style="padding:20px 12px;color:var(--text2);font-size:11px">Select an object to inspect.</div>';
    }
    renderSceneTree();
    EventBus.emit('scene:selectionChanged', {id});
  }

  function deleteObject(id){
    const obj = objects.get(id);
    if(!obj) return;
    if(obj.mesh){ scene.remove(obj.mesh); obj.mesh.geometry.dispose(); obj.mesh.material.dispose(); }
    if(obj.light){ scene.remove(obj.light); }
    if(obj.helper){ scene.remove(obj.helper); }
    objects.delete(id);
    if(selectedId === id) selectObject(null);
    renderSceneTree();
    updateVpObjects();
    EventBus.emit('scene:objectRemoved', {id});
  }

  function onMouseDown(e){
    isDragging = false;
    mouseButton = e.button;
    lastMouse = { x:e.clientX, y:e.clientY };

    if(e.button === 0 && activeTool === 'select'){
      const rect = renderer.domElement.getBoundingClientRect();
      mouse2D.x = ((e.clientX - rect.left) / rect.width)*2 - 1;
      mouse2D.y = -((e.clientY - rect.top) / rect.height)*2 + 1;
      raycaster.setFromCamera(mouse2D, camera);
      const meshes = [...objects.values()].filter(o=>o.mesh||o.helper).map(o=>o.mesh||o.helper);
      const hits = raycaster.intersectObjects(meshes.filter(Boolean));
      if(hits.length > 0){
        const hit = hits[0].object;
        if(hit.userData.isHelper){
          const owner = [...objects.values()].find(o=>o.helper === hit);
          if(owner) selectObject(owner.id);
        } else {
          const uid = hit.userData.id;
          if(uid) selectObject(uid);
        }
      } else {
        selectObject(null);
      }
    }

    e.target.addEventListener('mousemove', onDrag, {once:false});
    e.target.addEventListener('mouseup', ()=> e.target.removeEventListener('mousemove', onDrag), {once:true});
  }

  function onDrag(e){
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    if(Math.abs(dx)+Math.abs(dy) > 2) isDragging = true;
    if(!isDragging) return;

    if(mouseButton === 1 || (mouseButton === 0 && e.altKey)){
      const spd = 0.005;
      const theta = -dx * spd;
      const phi = -dy * spd;
      const offset = camera.position.clone().sub(orbitTarget);
      const r = offset.length();
      let thetaA = Math.atan2(offset.x, offset.z) + theta;
      let phiA = Math.acos(offset.y/r) + phi;
      phiA = Math.max(0.05, Math.min(Math.PI-0.05, phiA));
      camera.position.set(
        orbitTarget.x + r*Math.sin(phiA)*Math.sin(thetaA),
        orbitTarget.y + r*Math.cos(phiA),
        orbitTarget.z + r*Math.sin(phiA)*Math.cos(thetaA)
      );
      camera.lookAt(orbitTarget);
    } else if(mouseButton === 2){
      const panSpd = 0.01;
      const right = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
      camera.position.addScaledVector(right, -dx*panSpd);
      camera.position.y += dy*panSpd;
      orbitTarget.addScaledVector(right, -dx*panSpd);
      orbitTarget.y += dy*panSpd;
      camera.lookAt(orbitTarget);
    }
    lastMouse = {x:e.clientX, y:e.clientY};
  }

  function onMouseMove(e){ lastMouse={x:e.clientX, y:e.clientY}; }

  function onWheel(e){
    const dir = new THREE.Vector3().subVectors(camera.position, orbitTarget).normalize();
    camera.position.addScaledVector(dir, e.deltaY * 0.01);
  }

  function onKeyDown(e){
    if(e.target.matches('input,textarea')) return;
    if(e.key === 'Delete' || e.key === 'Backspace'){ if(selectedId) deleteObject(selectedId); }
    if(e.key === 'f' || e.key === 'F'){ if(selectedId) focusSelected(); }
    if(e.key === 'g' || e.key === 'G') toggleGrid();
    if(e.key === '`'){ e.preventDefault(); toggleCLI(); }
    if(e.ctrlKey && e.key === 'k'){ e.preventDefault(); document.getElementById('chat-input').focus(); }
  }

  function focusSelected(){
    if(!selectedId) return;
    const obj = objects.get(selectedId);
    const target = obj?.mesh?.position || obj?.light?.position;
    if(target){ orbitTarget.copy(target); camera.lookAt(orbitTarget); }
  }

  function updateGizmo(){
    const gc = document.getElementById('gizmo-canvas');
    if(!gc._ctx){ gc.width=80; gc.height=80; gc._ctx = gc.getContext('2d'); }
    const ctx = gc._ctx;
    ctx.clearRect(0,0,80,80);
    const cx=40, cy=40, r=28;
    ctx.fillStyle='rgba(24,24,27,0.7)'; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#2a2a30'; ctx.lineWidth=1; ctx.stroke();
    const axes = [
      {v:new THREE.Vector3(1,0,0), color:'#ff5c5c', label:'X'},
      {v:new THREE.Vector3(0,1,0), color:'#3dffa0', label:'Y'},
      {v:new THREE.Vector3(0,0,1), color:'#5c9cfc', label:'Z'},
    ];
    axes.forEach(a=>{
      const mat = new THREE.Matrix4().lookAt(camera.position, orbitTarget, camera.up);
      const v2 = a.v.clone().applyMatrix4(mat);
      const sx = cx + v2.x * 22, sy = cy - v2.y * 22;
      ctx.strokeStyle = a.color; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(sx,sy); ctx.stroke();
      ctx.fillStyle = a.color; ctx.font='bold 9px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(a.label, sx, sy);
    });
  }

  function updateInfoOverlay(){
    const p = camera.position;
    document.getElementById('vp-cam-pos').textContent = `CAM — x:${p.x.toFixed(1)} y:${p.y.toFixed(1)} z:${p.z.toFixed(1)}`;
    document.getElementById('vp-fps').textContent = `FPS: ${fps}`;
    document.getElementById('vp-objects').textContent = `Objects: ${objects.size}`;
  }
  function updateVpObjects(){ updateInfoOverlay(); }

  function toggleWireframe(){
    wireframe = !wireframe;
    objects.forEach(obj=>{ if(obj.mesh) obj.mesh.material.wireframe = wireframe; });
    notify('info', `Wireframe: ${wireframe ? 'ON':'OFF'}`);
  }

  function toggleGrid(){
    gridVisible = !gridVisible;
    gridHelper.visible = gridVisible;
    axesHelper.visible = gridVisible;
  }

  function resetCamera(){
    camera.position.set(6,5,10);
    orbitTarget.set(0,0,0);
    camera.lookAt(orbitTarget);
  }

  function getSceneState(){
    const objs = [];
    objects.forEach(obj=>{
      const p = obj.mesh?.position || obj.light?.position;
      const r = obj.mesh?.rotation;
      const s = obj.mesh?.scale;
      objs.push({ id:obj.id, name:obj.name, type:obj.type,
        position: p ? {x:+p.x.toFixed(3),y:+p.y.toFixed(3),z:+p.z.toFixed(3)} : null,
        rotation: r ? {x:+r.x.toFixed(3),y:+r.y.toFixed(3),z:+r.z.toFixed(3)} : null,
        scale: s ? {x:+s.x.toFixed(3),y:+s.y.toFixed(3),z:+s.z.toFixed(3)} : null,
      });
    });
    const selected = selectedId ? objects.get(selectedId)?.name : null;
    return { objectCount: objects.size, objects: objs, selected };
  }

  function getSelected(){ return selectedId ? objects.get(selectedId) : null; }

  return {
    init, addMesh, addLight, selectObject, deleteObject, focusSelected,
    toggleWireframe, toggleGrid, resetCamera,
    getSceneState, getSelected,
    getCamera(){ return camera; },
    getOrbitTarget(){ return orbitTarget; },
    getRendererDomElement(){ return renderer?.domElement || document.getElementById('three-canvas'); },
    get objects(){ return objects; },
    setTool(t){ activeTool = t; document.getElementById('sb-tool').textContent = `Tool: ${t[0].toUpperCase()+t.slice(1)}`; }
  };
})();

function renderSceneTree(){
  const tree = document.getElementById('scene-tree');
  let html = '';
  const selected = SceneManager.getSelected();
  SceneManager.objects.forEach(obj=>{
    const isSel = selected && selected.id === obj.id;
    const icon = obj.type==='cube'?'□':obj.type==='sphere'?'○':obj.type==='plane'?'▬':obj.type==='cylinder'?'▭':obj.type.includes('light')?'✦':'⬡';
    html += `<div class="tree-item${isSel?' selected':''}" onclick="SceneManager.selectObject('${obj.id}')">
      <span class="icon">${icon}</span>${obj.name}
      <span class="badge">${obj.type}</span>
    </div>`;
  });
  tree.innerHTML = html;
}

function renderPropsPanel(obj){
  if(!obj) return;
  const mesh = obj.mesh; const light = obj.light;
  const p = mesh?.position || light?.position || {x:0,y:0,z:0};
  const r = mesh?.rotation || {x:0,y:0,z:0};
  const s = mesh?.scale || {x:1,y:1,z:1};
  document.getElementById('props-content').innerHTML = `
    <div class="prop-group">
      <div class="prop-label">${obj.name} — ${obj.type}</div>
    </div>
    <div class="prop-group">
      <div class="prop-label">Position</div>
      <div class="prop-row"><span class="prop-key">XYZ</span><div class="prop-vec">
        <input type="number" value="${p.x.toFixed(3)}" step="0.1" onchange="setProp('px',this.value,'${obj.id}')">
        <input type="number" value="${p.y.toFixed(3)}" step="0.1" onchange="setProp('py',this.value,'${obj.id}')">
        <input type="number" value="${p.z.toFixed(3)}" step="0.1" onchange="setProp('pz',this.value,'${obj.id}')">
      </div></div>
    </div>
    ${mesh ? `
    <div class="prop-group">
      <div class="prop-label">Rotation (rad)</div>
      <div class="prop-row"><span class="prop-key">XYZ</span><div class="prop-vec">
        <input type="number" value="${r.x.toFixed(3)}" step="0.01" onchange="setProp('rx',this.value,'${obj.id}')">
        <input type="number" value="${r.y.toFixed(3)}" step="0.01" onchange="setProp('ry',this.value,'${obj.id}')">
        <input type="number" value="${r.z.toFixed(3)}" step="0.01" onchange="setProp('rz',this.value,'${obj.id}')">
      </div></div>
    </div>
    <div class="prop-group">
      <div class="prop-label">Scale</div>
      <div class="prop-row"><span class="prop-key">XYZ</span><div class="prop-vec">
        <input type="number" value="${s.x.toFixed(3)}" step="0.1" onchange="setProp('sx',this.value,'${obj.id}')">
        <input type="number" value="${s.y.toFixed(3)}" step="0.1" onchange="setProp('sy',this.value,'${obj.id}')">
        <input type="number" value="${s.z.toFixed(3)}" step="0.1" onchange="setProp('sz',this.value,'${obj.id}')">
      </div></div>
    </div>` : ''}
    <div class="prop-group">
      <div class="prop-label">Actions</div>
      <div class="prop-row" style="gap:4px">
        <button class="plugin-btn" onclick="duplicateSelected()">Duplicate</button>
        <button class="plugin-btn" style="color:var(--red)" onclick="deleteSelected()">Delete</button>
      </div>
    </div>
  `;
}

function setProp(prop, val, id){
  const obj = SceneManager.objects.get(id);
  if(!obj) return;
  const v = parseFloat(val);
  if(isNaN(v)) return;
  const m = obj.mesh || obj.light;
  if(!m) return;
  if(prop==='px') m.position.x=v;
  else if(prop==='py') m.position.y=v;
  else if(prop==='pz') m.position.z=v;
  else if(prop==='rx' && obj.mesh) obj.mesh.rotation.x=v;
  else if(prop==='ry' && obj.mesh) obj.mesh.rotation.y=v;
  else if(prop==='rz' && obj.mesh) obj.mesh.rotation.z=v;
  else if(prop==='sx' && obj.mesh) obj.mesh.scale.x=v;
  else if(prop==='sy' && obj.mesh) obj.mesh.scale.y=v;
  else if(prop==='sz' && obj.mesh) obj.mesh.scale.z=v;
}

function renderPluginList(){
  const list = document.getElementById('plugin-list');
  const plugins = PluginRegistry.list();
  if(plugins.length === 0){
    list.innerHTML = '<div style="padding:16px 12px;color:var(--text2);font-size:11px">No plugins registered.</div>';
    return;
  }
  list.innerHTML = plugins.map(p=>`
    <div class="plugin-item">
      <div class="plugin-name">${p.name||p.id}</div>
      <span class="plugin-status ${p.active?'active':'inactive'}">${p.active?'active':'inactive'}</span>
      <button class="plugin-btn" onclick="PluginRegistry.toggle('${p.id}')">${p.active?'Disable':'Enable'}</button>
    </div>
  `).join('');
}

const EntityRegistry = (() => {
  const entities = new Map();

  function createEntity({ id, name, type, transform = {}, components = [], capabilities = [], relationships = [], provenance = {} }) {
    const entity = {
      id,
      name,
      type,
      transform,
      components,
      capabilities,
      relationships,
      lifecycle: { state: "active" },
      provenance: {
        createdBy: provenance.createdBy || "editor",
        createdAt: provenance.createdAt || new Date().toISOString()
      }
    };

    entities.set(id, entity);
    return entity;
  }

  function get(id) {
    return entities.get(id) || null;
  }

  function remove(id) {
    entities.delete(id);
  }

  function list() {
    return [...entities.values()];
  }

  function updateTransform(id, transform) {
    const entity = entities.get(id);
    if (!entity) return null;
    entity.transform = { ...entity.transform, ...transform };
    return entity;
  }

  return { createEntity, get, remove, list, updateTransform };
})();

const CLIRuntime = (() => {
  let open = false;
  const history = [];
  let histIdx = -1;

  const commands = {
    help(){ cliPrint('info', 'Commands: help | model [scan|list|current] | scene [info|clear] | add <type> | select <name> | delete | plugin [list|add] | wireframe | grid | cam reset | exec <js> | ask <question> | export | save | version | clear'); },
    clear(){ document.getElementById('cli-output').innerHTML = ''; },
    version(){ cliPrint('ok', 'AXIOM Editor v0.1.0 — AI Native Game Editor'); },
    async model(args){
      const sub = args[0];
      if(!sub||sub==='scan'){ await ModelBus.scan(); }
      else if(sub==='list'){
        const av = ModelBus.getAvailable();
        if(av.length===0) cliPrint('warn','No endpoints found. Run: model scan');
        av.forEach(ep=>{ cliPrint('info',`${ep.name}:`); (ep.models||[]).forEach(m=>cliPrint('out',`  - ${m.id||m}`)); });
      } else if(sub==='current'){ const c=ModelBus.getCurrent(); cliPrint('ok',c?`${c.endpoint.name} / ${c.model}`:'No model'); }
      else cliPrint('err',`Unknown model command: ${sub}`);
    },
    scene(args){
      const sub = args[0];
      if(!sub||sub==='info'){
        const s = SceneManager.getSceneState();
        cliPrint('info',`Scene: ${s.objectCount} objects${s.selected?`, selected: ${s.selected}`:''}`);
        s.objects.forEach(o=>cliPrint('out',`  ${o.type} "${o.name}"`));
      } else if(sub==='clear'){
  SceneManager.objects.forEach((_, id) => SceneManager.deleteObject(id)); EntityRegistry.remove(id);
  cliPrint('ok','Scene cleared');
}
      else cliPrint('err','Unknown scene command');
    },

    entities(){
  const ents = EntityRegistry.list();

  cliPrint("info", `Entities: ${ents.length}`);

  ents.forEach(e => {
    cliPrint(
      "out",
      `${e.id} | ${e.name} | ${e.type} | ${e.components.join(", ")}`
    );
  });
},
    add(args){ const type = args[0]; if(!type){ cliPrint('err','Usage: add <type>'); return; } addObject(type); },
    select(args){
      const name = args.join(' ');
      const found = [...SceneManager.objects.values()].find(o=>o.name.toLowerCase()===name.toLowerCase());
      if(found){ SceneManager.selectObject(found.id); cliPrint('ok',`Selected: ${found.name}`); }
      else cliPrint('err',`Not found: ${name}`);
    },
    delete(){ const sel = SceneManager.getSelected(); if(sel){ SceneManager.deleteObject(sel.id); cliPrint('ok',`Deleted: ${sel.name}`); } else cliPrint('warn','Nothing selected'); },
    wireframe(){ SceneManager.toggleWireframe(); },
    grid(){ SceneManager.toggleGrid(); },
    cam(args){ if(args[0]==='reset') SceneManager.resetCamera(); },
    plugin(args){
      const sub = args[0];
      if(!sub||sub==='list'){
        const ps = PluginRegistry.list();
        if(ps.length===0) cliPrint('warn','No plugins registered');
        ps.forEach(p=>cliPrint(p.active?'ok':'warn',`${p.id} — ${p.active?'active':'inactive'}`));
      } else if(sub==='add'){
        cliPrint('info','window.EDITOR.plugins.register("id", { name:"Name", init(editor){ /* editor.scene / editor.events / editor.chat */ } })');
      }
    },
    exec(args){ const code = args.join(' '); try { const r = eval(code); cliPrint('ok', r !== undefined ? String(r) : 'OK'); } catch(e){ cliPrint('err', e.message); } },
    async ask(args){
      const q = args.join(' ');
      if(!q){ cliPrint('warn','Usage: ask <question>'); return; }
      cliPrint('info','Asking model...');
      try { const ans = await ModelBus.complete([{role:'user',content:q}]); cliPrint('ok', ans); }
      catch(e){ cliPrint('err', e.message); }
    },
    export(){ cliPrint('info', JSON.stringify(SceneManager.getSceneState(), null, 2)); },
    save(){ cliPrint('ok', 'Scene serialized (use /export to view JSON)'); }
  };

  function parse(input){
    input = input.trim(); if(!input) return;
    history.unshift(input); histIdx = -1;
    cliPrint('cmd', '› ' + input);
    const parts = input.split(/\s+/);
    const cmd = parts[0].replace(/^\//,'');
    const args = parts.slice(1);
    if(commands[cmd]) Promise.resolve(commands[cmd](args));
    else cliPrint('err', `Unknown command: ${cmd}. Type /help`);
  }

  function bindInput(){
    const inp = document.getElementById('cli-input');
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ parse(inp.value); inp.value=''; }
      if(e.key==='ArrowUp'){ histIdx=Math.min(histIdx+1,history.length-1); inp.value=history[histIdx]||''; e.preventDefault(); }
      if(e.key==='ArrowDown'){ histIdx=Math.max(histIdx-1,-1); inp.value=histIdx>=0?history[histIdx]:''; e.preventDefault(); }
    });
  }

  return {
    parse,
    toggle(){ open=!open; document.getElementById('cli-panel').classList.toggle('open',open); if(open) document.getElementById('cli-input').focus(); },
    bindInput,
    isOpen:()=>open
  };
})();

function cliPrint(type, text){
  const out = document.getElementById('cli-output');
  const div = document.createElement('div');
  div.className = 'cli-line cli-' + type;
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function cliCmd(cmd){ if(!CLIRuntime.isOpen()) CLIRuntime.toggle(); CLIRuntime.parse(cmd); }

const ChatRuntime = (() => {
  const history = [];
  let includeScene = false;
  let includeSelected = false;
  let streaming = false;

  function addMsg(role, text, opts={}){
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg ' + (opts.cls || role);
    if(role !== 'system'){
      div.innerHTML = `<div class="sender">${role==='user'?'You':'AXIOM AI'}</div>` + formatMsg(text);
    } else {
      div.textContent = text;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function formatMsg(text){
    return text
      .replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre>$2</pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  async function send(userText){
    if(streaming || !userText.trim()) return;
    streaming = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('typing-indicator').classList.add('show');

    let fullText = userText;
    if(includeScene){ const s = SceneManager.getSceneState(); fullText += '\n\n[SCENE CONTEXT]\n' + JSON.stringify(s, null, 2); }
    if(includeSelected){ const sel = SceneManager.getSelected(); if(sel) fullText += '\n\n[SELECTED OBJECT]\n' + JSON.stringify({id:sel.id,name:sel.name,type:sel.type},null,2); }

    addMsg('user', userText);

    if (await tryHandleDirectMcpChat(userText)) {
      streaming = false;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('typing-indicator').classList.remove('show');
      return;
    }

    const contractOutcome = await tryHandleContractAgent(userText);
    if (contractOutcome.handled) {
      streaming = false;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('typing-indicator').classList.remove('show');
      return;
    }

    history.push({ role:'user', content: fullText });

    const sceneState = SceneManager.getSceneState();
const selected = SceneManager.getSelected();
const entities = EntityRegistry.list();

const runtimeContext = {
  scene: sceneState,
  selected: selected
    ? {
        id: selected.id,
        name: selected.name,
        type: selected.type
      }
    : null,
  entities: entities.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    components: e.components,
    capabilities: e.capabilities
  })),
  tools: getAvailableMcpTools().map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }))
};


function getAvailableMcpTools() {
  try {
    if (window.SSEBridge?.tools && Array.isArray(window.SSEBridge.tools)) return window.SSEBridge.tools;
    if (typeof SSEBridge !== 'undefined' && Array.isArray(SSEBridge.tools)) return SSEBridge.tools;
    const maybe = window.EDITOR?.mcp?.tools;
    if (Array.isArray(maybe)) return maybe;
    if (typeof maybe === 'function') return maybe() || [];
  } catch (_) {}
  return [];
}

function logAxiomContractFailure(stage, detail) {
  const entry = {
    source: 'AXIOM_CONTRACT_AGENT_V0',
    stage,
    detail,
    scene: SceneManager.getSceneState(),
    selected: SceneManager.getSelected()?.id || null,
    createdAt: new Date().toISOString()
  };
  try {
    const key = 'axiom.contract.failures';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift(entry);
    localStorage.setItem(key, JSON.stringify(list.slice(0, 80)));
  } catch (_) {}
  try { SSEBridge.post('ace_event', { type: 'axiom_contract_failure', entry }); } catch (_) {}
  cliPrint('warn', `AXIOM contract failure logged: ${stage}`);
  return entry;
}

function stripJsonish(text) {
  return String(text || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function tryParseJsonObject(text) {
  const raw = stripJsonish(text);
  try { return JSON.parse(raw); } catch (_) {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

function normaliseVec3(pos, fallback = { x: 0, y: 0.5, z: 0 }) {
  const p = pos || {};
  return {
    x: Number.isFinite(Number(p.x)) ? Number(p.x) : fallback.x,
    y: Number.isFinite(Number(p.y)) ? Number(p.y) : fallback.y,
    z: Number.isFinite(Number(p.z)) ? Number(p.z) : fallback.z
  };
}

function findSceneObjectByHint(hint) {
  const h = String(hint || '').toLowerCase();
  const objects = SceneManager.getSceneState().objects || [];
  return objects.find(o => String(o.name || '').toLowerCase().includes(h) || String(o.type || '').toLowerCase().includes(h)) || null;
}

function inferPositionFromText(text, type) {
  const lower = String(text || '').toLowerCase();
  const xyz = lower.match(/(?:at|position|pos)\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,?\s+(-?\d+(?:\.\d+)?)\s*,?\s+(-?\d+(?:\.\d+)?)/i);
  if (xyz) return { x: Number(xyz[1]), y: Number(xyz[2]), z: Number(xyz[3]) };

  const cube = findSceneObjectByHint('cube');
  const selected = SceneManager.getSelected();
  const anchor = lower.includes('selected') && selected
    ? { position: SceneManager.getSceneState().objects.find(o => o.id === selected.id)?.position || { x:0, y:0.5, z:0 } }
    : cube;
  if (anchor && /next to|beside|near|right of|left of|behind|in front/.test(lower)) {
    const p = anchor.position || { x:0, y:0.5, z:0 };
    const d = type === 'sphere' ? 1.8 : 1.5;
    if (lower.includes('left of')) return { x: p.x - d, y: p.y, z: p.z };
    if (lower.includes('behind')) return { x: p.x, y: p.y, z: p.z - d };
    if (lower.includes('in front')) return { x: p.x, y: p.y, z: p.z + d };
    return { x: p.x + d, y: p.y, z: p.z };
  }
  return { x: type === 'sphere' ? 2 : 0, y: 0.5, z: 0 };
}

function deterministicIntentFromText(text) {
  const lower = String(text || '').toLowerCase();
  const createVerb = /\b(create|add|spawn|make|place|put)\b/.test(lower);
  const typeMatch = lower.match(/\b(cube|box|sphere|ball|plane|floor|cylinder|cone|point light|directional light)\b/);
  if (!createVerb || !typeMatch) return null;
  let type = typeMatch[1];
  if (type === 'box') type = 'cube';
  if (type === 'ball') type = 'sphere';
  if (type === 'floor') type = 'plane';
  if (type === 'point light') type = 'light-point';
  if (type === 'directional light') type = 'light-dir';

  const colour = lower.match(/\b(red|blue|green|yellow|purple|white|black|orange|pink)\b/)?.[1];
  return {
    command: 'mcp_call',
    tool: 'axiom_create_object',
    parameters: {
      type,
      position: inferPositionFromText(text, type),
      ...(colour ? { material: colour, color: colour } : {}),
      select: true
    },
    confidence: 0.78,
    source: 'deterministic_interpreter'
  };
}

function validateAxiomIntent(intent) {
  const errors = [];
  const tools = getAvailableMcpTools();
  const names = new Set(tools.map(t => t.name));
  if (!intent || typeof intent !== 'object') errors.push('intent_not_object');
  const command = intent?.command || intent?.type;
  const tool = intent?.tool || intent?.name;
  if (command !== 'mcp_call' && command !== 'tool_call') errors.push('unsupported_command');
  if (!tool) errors.push('missing_tool');
  if (tool && names.size && !names.has(tool)) errors.push(`tool_not_available:${tool}`);
  if (tool === 'axiom_create_object') {
    const params = intent.parameters || intent.arguments || intent.params || {};
    const allowed = new Set(['cube','sphere','plane','cylinder','cone','light-point','light-dir']);
    if (!allowed.has(params.type)) errors.push(`unsupported_object_type:${params.type}`);
    const p = params.position;
    if (!p || ['x','y','z'].some(k => !Number.isFinite(Number(p[k])))) errors.push('invalid_position_vec3');
  }
  return { ok: errors.length === 0, errors };
}

function normaliseAxiomIntent(intent) {
  if (!intent || typeof intent !== 'object') return null;
  const tool = intent.tool || intent.name;
  const raw = intent.parameters || intent.arguments || intent.params || {};
  if (tool === 'axiom_create_object') {
    let type = String(raw.type || raw.objectType || 'cube').toLowerCase();
    if (type === 'box') type = 'cube';
    if (type === 'ball') type = 'sphere';
    return {
      command: 'mcp_call',
      tool,
      parameters: {
        ...raw,
        type,
        position: normaliseVec3(raw.position),
        select: raw.select !== false
      },
      confidence: Number(intent.confidence || 0.5),
      source: intent.source || 'llm_contract'
    };
  }
  return {
    command: 'mcp_call',
    tool,
    parameters: raw,
    confidence: Number(intent.confidence || 0.5),
    source: intent.source || 'llm_contract'
  };
}

async function requestIntentFromModel(userText, repairNote = '') {
  const tools = getAvailableMcpTools().map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  const scene = SceneManager.getSceneState();
  const system = `You are AXIOM Contract Agent v0. Convert the user request into ONE strict JSON object only. No markdown. No prose.
Return this shape only:
{"command":"mcp_call","tool":"axiom_create_object","parameters":{"type":"sphere","position":{"x":2,"y":0.5,"z":0},"select":true},"confidence":0.0,"reason":"short"}
Use only available tools. If no tool should be called, return {"command":"none","reason":"...","confidence":0.0}.
Available tools: ${JSON.stringify(tools)}
Current scene: ${JSON.stringify(scene)}
${repairNote ? `Previous output failed validation: ${repairNote}` : ''}`;
  const out = await ModelBus.complete([{ role: 'user', content: userText }], { system, max_tokens: 400 });
  return tryParseJsonObject(out);
}

async function tryHandleContractAgent(userText) {
  const direct = deterministicIntentFromText(userText);
  if (direct) {
    const normalised = normaliseAxiomIntent(direct);
    const valid = validateAxiomIntent(normalised);
    if (valid.ok) {
      addMsg('system', `Contract Agent: deterministic route → ${normalised.tool}`);
      const receipt = await executeAICommand(normalised);
      addMsg('assistant', `Contract receipt for \`${normalised.tool}\`:\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\``);
      return { handled: true, ok: true, receipt };
    }
    logAxiomContractFailure('deterministic_validation_failed', { userText, intent: normalised, errors: valid.errors });
  }

  if (!getAvailableMcpTools().length) return { handled: false, ok: false, reason: 'no_mcp_tools' };

  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await requestIntentFromModel(userText, lastErrors.join(', '));
      if (!raw || raw.command === 'none') return { handled: false, ok: false, reason: raw?.reason || 'no_tool_needed' };
      const normalised = normaliseAxiomIntent(raw);
      const valid = validateAxiomIntent(normalised);
      if (!valid.ok) {
        lastErrors = valid.errors;
        logAxiomContractFailure('llm_contract_validation_failed', { attempt, userText, raw, normalised, errors: valid.errors });
        continue;
      }
      addMsg('system', `Contract Agent: LLM route verified → ${normalised.tool}`);
      const receipt = await executeAICommand(normalised);
      addMsg('assistant', `Contract receipt for \`${normalised.tool}\`:\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\``);
      return { handled: true, ok: true, receipt };
    } catch (err) {
      lastErrors = [err.message];
      logAxiomContractFailure('llm_contract_exception', { attempt, userText, error: err.message });
    }
  }

  addMsg('system', `⚠ Contract Agent failed validation after retries: ${lastErrors.join(', ')}`);
  return { handled: true, ok: false, errors: lastErrors };
}

function extractAICommands(text) {
  const commands = [];
  const fenced = [...String(text || '').matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]);
  const candidates = fenced.length ? fenced : [String(text || '')];

  for (const source of candidates) {
    const trimmed = source.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      arr.forEach(cmd => { if (cmd && typeof cmd === 'object' && cmd.command) commands.push(cmd); });
      continue;
    } catch (_) {}

    const matches = trimmed.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
    for (const m of matches) {
      try {
        const cmd = JSON.parse(m);
        if (cmd && typeof cmd === 'object' && cmd.command) commands.push(cmd);
      } catch (_) {}
    }
  }
  return commands;
}

async function tryExecuteAICommand(text) {
  const commands = extractAICommands(text);
  if (!commands.length) return [];

  const receipts = [];
  for (const cmd of commands) {
    try {
      console.log('AI COMMAND:', cmd);
      const receipt = await executeAICommand(cmd);
      if (receipt) receipts.push(receipt);
    } catch (err) {
      receipts.push({ ok: false, command: cmd.command, tool: cmd.tool || cmd.name || null, error: err.message });
    }
  }
  return receipts;
}

async function executeAICommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return null;

  if (cmd.command === 'mcp_call') {
    const tool = cmd.tool || cmd.name;
    const parameters = cmd.parameters || cmd.params || {};
    if (!tool) throw new Error('mcp_call missing tool name');
    if (!window.EDITOR?.mcp?.call) throw new Error('MCP bridge not available');

    cliPrint('info', `AI requested MCP tool: ${tool}`);
    const res = await window.EDITOR.mcp.call(tool, parameters);
    const result = res?.result || res || {};
    const receipt = {
      ok: true,
      command: 'mcp_call',
      tool,
      parameters,
      applied: !!result.applied,
      result,
      receivedAt: new Date().toISOString()
    };
    notify('ok', `MCP ${tool}: ${receipt.applied ? 'applied' : 'completed'}`);
    cliPrint('ok', `AI MCP receipt ${tool}: ${JSON.stringify(result).slice(0, 600)}`);
    return receipt;
  }

  if (cmd.command === 'create_object') {
    const p = cmd.parameters?.position || {};
    return executeAICommand({
      command: 'mcp_call',
      tool: 'axiom_create_object',
      parameters: {
        type: cmd.parameters?.type || 'cube',
        name: cmd.parameters?.name,
        position: { x: p.x || 0, y: p.y || 0, z: p.z || 0 },
        select: true
      }
    });
  }

  return null;
}

async function tryHandleDirectMcpChat(userText) {
  const text = String(userText || '').trim();
  const match = text.match(/^\/?mcp\s+(?:call\s+)?([^\s]+)(?:\s+([\s\S]+))?$/i);
  if (!match) return false;

  const tool = match[1];
  const raw = (match[2] || '{}').trim();
  let params = {};
  try { params = raw ? JSON.parse(raw) : {}; }
  catch (e) { addMsg('system', `⚠ MCP params must be valid JSON: ${e.message}`); return true; }

  try {
    addMsg('system', `Calling MCP tool: ${tool}...`);
    const receipt = await executeAICommand({ command: 'mcp_call', tool, parameters: params });
    addMsg('assistant', `MCP receipt for \`${tool}\`:
\`\`\`json
${JSON.stringify(receipt, null, 2)}
\`\`\``);
  } catch (e) {
    addMsg('system', `⚠ MCP ${tool} failed: ${e.message}`);
  }
  return true;
}

const system = `
You are AXIOM AI, embedded directly inside the AXIOM editor runtime.

You HAVE live access to the runtime context below.

RUNTIME_CONTEXT:
${JSON.stringify(runtimeContext, null, 2)}

You can:
- inspect scene entities
- reason about objects
- suggest plugins
- use exposed MCP tools when they appear in RUNTIME_CONTEXT.tools

Tool-use contract:
When a user request needs an available MCP tool, respond with a brief reason and include exactly one fenced JSON command block:
\`\`\`json
{"command":"mcp_call","tool":"tool_name","parameters":{}}
\`\`\`

If a user asks you to create/add/spawn an object and axiom_create_object is available, use:
\`\`\`json
{"command":"mcp_call","tool":"axiom_create_object","parameters":{"type":"sphere","position":{"x":2,"y":0.5,"z":0},"select":true}}
\`\`\`

Use only tools listed in RUNTIME_CONTEXT.tools.
Do not claim a mutation happened unless a tool receipt returns applied:true.
Never claim you can inspect files unless file tools are present in RUNTIME_CONTEXT.tools.
Never claim you cannot access scene state if it exists in runtime context.
`;
      // ── Streaming send ──
      const msgs2 = document.getElementById('chat-messages');
      const bubble = document.createElement('div');
      bubble.className = 'msg assistant';
      bubble.innerHTML = '<div class="sender">AXIOM AI</div><span class="stream-content"></span><span class="stream-cur">▋</span>';
      msgs2.appendChild(bubble);
      msgs2.scrollTop = msgs2.scrollHeight;
      const streamContent = bubble.querySelector('.stream-content');
      const streamCur = bubble.querySelector('.stream-cur');
      streamCur.style.cssText = 'color:var(--accent);animation:blink-cur 0.8s step-end infinite';

      let replyText = '';
      try {
        replyText = await ModelBus.stream(history.slice(-12), { system, max_tokens: 1024 }, (delta) => {
          replyText += delta;
          streamContent.innerHTML = formatMsg(replyText);
          msgs2.scrollTop = msgs2.scrollHeight;
        });
        streamCur.remove();
        const receipts = await tryExecuteAICommand(replyText);
        if (receipts.length) {
          const receiptText = `Tool receipt${receipts.length > 1 ? 's' : ''}:\n\`\`\`json\n${JSON.stringify(receipts, null, 2)}\n\`\`\``;
          addMsg('assistant', receiptText);
          history.push({ role:'tool', content: JSON.stringify(receipts) });
        }
        history.push({ role:'assistant', content: replyText });
      } catch(e) {
        streamCur.remove();
        bubble.remove();
        addMsg('system', `⚠ ${e.message}`);
      }
      streaming = false;
      document.getElementById('send-btn').disabled = false;
      document.getElementById('typing-indicator').classList.remove('show');
  }

  return {
    send,
    toggleScene(){ includeScene=!includeScene; document.getElementById('scene-ctx-btn').classList.toggle('active',includeScene); },
    toggleSelected(){ includeSelected=!includeSelected; document.getElementById('sel-ctx-btn').classList.toggle('active',includeSelected); },
    clear(){ document.getElementById('chat-messages').innerHTML=''; history.length=0; }
  };
})();

window.EDITOR = {
  version: '0.2.0',
  events: EventBus,
  plugins: PluginRegistry,
  scene: {
    add(type, opts){ return type.includes('light') ? SceneManager.addLight(type, opts) : SceneManager.addMesh(type, opts); },
    select(id){ SceneManager.selectObject(id); },
    delete(id){ SceneManager.deleteObject(id); },
    getState(){ return SceneManager.getSceneState(); },
    getSelected(){ return SceneManager.getSelected(); },
    focusSelected(){ return SceneManager.focusSelected(); },
    getCamera(){ return SceneManager.getCamera(); },
    getOrbitTarget(){ return SceneManager.getOrbitTarget(); },
    getRendererDomElement(){ return SceneManager.getRendererDomElement(); },
    get objects(){ return SceneManager.objects; },
  },

  entities: {
    list(){ return EntityRegistry.list(); },
    get(id){ return EntityRegistry.get(id); }
  },

  model: ModelBus,
  chat: { send(msg){ document.getElementById('chat-input').value=msg; ChatRuntime.send(msg); } },
  cli: { exec(cmd){ CLIRuntime.parse(cmd); }, print(type,text){ cliPrint(type,text); } },
  sse: { broadcast: (e,d)=>SSEBridge.post(e,d), connect: ()=>SSEBridge.connect() },
  mcp: { call: (tool,params)=>SSEBridge.call(tool,params), tools: ()=>SSEBridge.tools },
  notify,
  panel: {
    register(id, label, renderFn){
      const tab = document.createElement('div');
      tab.className = 'ptab'; tab.textContent = label;
      const pane = document.createElement('div');
      pane.className = 'panel-content'; pane.id = 'panel-'+id; pane.style.display='none';
      document.getElementById('left-panel').appendChild(pane);
      tab.onclick = ()=>{ switchTab(id); renderFn(pane); };
      document.querySelector('.panel-tabs').appendChild(tab);
      notify('ok', `Panel '${label}' registered`);
    }
  }
};

// AXIOM Runtime Plugin Loader v0
// Browser-side loader. Add after window.EDITOR is created, before boot completes.
(function installAxiomRuntimePluginLoader(){
  if (window.AXIOM_PLUGIN_RUNTIME) return;

  const DEFAULT_BUILDER_URL = 'http://127.0.0.1:4242';
  const active = new Map();

  function log(...args){ console.log('[AXIOM_PLUGIN_RUNTIME]', ...args); }
  function warn(...args){ console.warn('[AXIOM_PLUGIN_RUNTIME]', ...args); }

  function getEditor(){
    if (!window.EDITOR) throw new Error('window.EDITOR is not available');
    return window.EDITOR;
  }

  function requiredRuntimeApis(){
    return [
      'scene.getCamera',
      'scene.getOrbitTarget',
      'scene.getRendererDomElement',
      'scene.getSelected',
      'scene.focusSelected'
    ];
  }

  function checkRuntimeApis(editor){
    const missing = [];
    if (typeof editor?.scene?.getCamera !== 'function') missing.push('scene.getCamera');
    if (typeof editor?.scene?.getOrbitTarget !== 'function') missing.push('scene.getOrbitTarget');
    if (typeof editor?.scene?.getRendererDomElement !== 'function') missing.push('scene.getRendererDomElement');
    if (typeof editor?.scene?.getSelected !== 'function') missing.push('scene.getSelected');
    if (typeof editor?.scene?.focusSelected !== 'function') missing.push('scene.focusSelected');
    return missing;
  }

  function buildContext(pluginId){
    const editor = getEditor();
    return {
      pluginId,
      THREE: window.THREE,
      scene: {
        getCamera: () => editor.scene.getCamera(),
        getOrbitTarget: () => editor.scene.getOrbitTarget(),
        getRendererDomElement: () => editor.scene.getRendererDomElement(),
        getSelected: () => editor.scene.getSelected(),
        focusSelected: () => editor.scene.focusSelected()
      },
      events: editor.events,
      notify: (msg) => editor.notify ? editor.notify('info', msg) : log(msg),
      logger: console,
      log: console
    };
  }

  async function inspectPlugin(pluginId, builderUrl = DEFAULT_BUILDER_URL){
    const res = await fetch(`${builderUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'axiom_plugin_inspect',
        arguments: { plugin_id: pluginId, include_files: true }
      })
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(`Plugin inspect failed: ${JSON.stringify(data.errors || data)}`);
    }
    return data.result;
  }

  async function importPluginSource(pluginId, source){
    if (!source || typeof source !== 'string') throw new Error('Plugin source is missing');
    const blob = new Blob([source], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(url + `#${encodeURIComponent(pluginId)}-${Date.now()}`);
      return { mod, url };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  async function activate(pluginId, options = {}){
    const builderUrl = options.builderUrl || DEFAULT_BUILDER_URL;
    if (!pluginId) return { ok: false, status: 'blocked', reason: 'missing_plugin_id' };
    if (active.has(pluginId)) return { ok: true, status: 'already_active', plugin_id: pluginId };

    const editor = getEditor();
    const missing = checkRuntimeApis(editor);
    if (missing.length) {
      return { ok: false, status: 'blocked', reason: 'missing_runtime_api', required_apis: requiredRuntimeApis(), missing_apis: missing };
    }

    let imported = null;
    try {
      const inspected = await inspectPlugin(pluginId, builderUrl);
      const manifest = inspected.manifest;
      if (!manifest) throw new Error('Plugin manifest missing from inspect response');
      if (manifest.validation_status?.passed !== true) throw new Error('Plugin validation_status.passed is not true');
      if (!['registered', 'active'].includes(manifest.lifecycle?.status)) {
        throw new Error(`Plugin must be registered before activation. Current: ${manifest.lifecycle?.status}`);
      }
      if (manifest.safety?.may_modify_core === true) throw new Error('Plugin requests core modification; activation blocked');

      const source = inspected.files?.['src/index.js'];
      imported = await importPluginSource(pluginId, source);
      const ctx = buildContext(pluginId);

      if (typeof imported.mod.onLoad === 'function') await imported.mod.onLoad(ctx);
      let activationResult = { ok: true };
      if (typeof imported.mod.onActivate === 'function') activationResult = await imported.mod.onActivate(ctx);
      if (activationResult && activationResult.ok === false) throw new Error(`Plugin onActivate returned ok:false: ${JSON.stringify(activationResult)}`);

      active.set(pluginId, { pluginId, manifest, module: imported.mod, moduleUrl: imported.url, context: ctx, activatedAt: new Date().toISOString() });
      editor.notify?.('ok', `Plugin active: ${manifest.name || pluginId}`);
      return { ok: true, status: 'active', plugin_id: pluginId, manifest_id: manifest.id, activated_at: active.get(pluginId).activatedAt, activation_result: activationResult };
    } catch (err) {
      try {
        if (imported?.mod?.onDeactivate) await imported.mod.onDeactivate(buildContext(pluginId));
      } catch (rollbackErr) {
        warn('rollback/deactivate after failed activation also failed', rollbackErr);
      }
      if (imported?.url) URL.revokeObjectURL(imported.url);
      return { ok: false, status: 'activation_failed_rolled_back', plugin_id: pluginId, error: String(err) };
    }
  }

  async function deactivate(pluginId){
    const entry = active.get(pluginId);
    if (!entry) return { ok: true, status: 'not_active', plugin_id: pluginId };
    try {
      if (typeof entry.module.onDeactivate === 'function') await entry.module.onDeactivate(entry.context);
      if (typeof entry.module.onUnload === 'function') await entry.module.onUnload(entry.context);
      URL.revokeObjectURL(entry.moduleUrl);
      active.delete(pluginId);
      getEditor().notify?.('ok', `Plugin deactivated: ${pluginId}`);
      return { ok: true, status: 'deactivated', plugin_id: pluginId };
    } catch (err) {
      return { ok: false, status: 'deactivate_failed', plugin_id: pluginId, error: String(err) };
    }
  }

  function status(){
    return { ok: true, active_plugins: [...active.values()].map(p => ({ plugin_id: p.pluginId, name: p.manifest?.name, activated_at: p.activatedAt })) };
  }

  async function applyClientAction(action){
    if (!action || !action.type) return { ok: false, reason: 'missing_client_action' };
    if (action.type === 'activate_plugin') return activate(action.payload?.plugin_id, action.payload || {});
    if (action.type === 'deactivate_plugin') return deactivate(action.payload?.plugin_id);
    if (action.type === 'plugin_runtime_status') return status();
    return { ok: false, reason: 'unknown_plugin_client_action', action_type: action.type };
  }

  window.AXIOM_PLUGIN_RUNTIME = { activate, deactivate, status, applyClientAction };
  log('installed');
})();


function switchTab(name){
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel-content').forEach(p=>p.style.display='none');
  const pane = document.getElementById('panel-'+name);
  if(pane) pane.style.display='block';
  const names = ['scene','props','plugins','stream'];
  const tabs = document.querySelectorAll('.ptab');
  const i = names.indexOf(name);
  if(i>=0 && tabs[i]) tabs[i].classList.add('active');
}

function addObject(type){ document.getElementById('add-menu').classList.remove('show'); type.includes('light')?SceneManager.addLight(type):SceneManager.addMesh(type); notify('info',`Added ${type}`); }
function toggleAddMenu(){ document.getElementById('add-menu').classList.toggle('show'); }
function toggleCLI(){ CLIRuntime.toggle(); }
function toggleWireframe(){ SceneManager.toggleWireframe(); }
function toggleGrid(){ SceneManager.toggleGrid(); }
function resetCamera(){ SceneManager.resetCamera(); }
function setTool(t){
  document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tool-'+t)?.classList.add('active');
  SceneManager.setTool(t);
}
function deleteSelected(){ const s=SceneManager.getSelected(); if(s) SceneManager.deleteObject(s.id); }
function duplicateSelected(){ const s=SceneManager.getSelected(); if(s) SceneManager.addMesh(s.type,{name:s.name+'_copy'}); }
function newScene(){ SceneManager.objects.forEach((_,id)=>SceneManager.deleteObject(id)); notify('info','New scene'); }
function showPluginPanel(){ switchTab('plugins'); }
function openModelSelector(){ cliCmd('model list'); }
function injectSceneContext(){ ChatRuntime.toggleScene(); }
function toggleSceneContext(){ ChatRuntime.toggleScene(); }
function toggleSelContext(){ ChatRuntime.toggleSelected(); }
function clearChat(){ ChatRuntime.clear(); }

function sendChat(){
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if(!text) return;
  inp.value = '';
  ChatRuntime.send(text);
}

document.getElementById('chat-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendChat(); } });

document.querySelectorAll('.menu-item').forEach(item=>{
  item.addEventListener('click', e=>{
    const isActive = item.classList.contains('active');
    document.querySelectorAll('.menu-item').forEach(i=>i.classList.remove('active'));
    if(!isActive) item.classList.add('active');
    e.stopPropagation();
  });
});
document.addEventListener('click', ()=>{ document.querySelectorAll('.menu-item').forEach(i=>i.classList.remove('active')); document.getElementById('add-menu')?.classList.remove('show'); });
document.getElementById('add-menu')?.addEventListener('click', e=>e.stopPropagation());

function notify(type, text){
  const stack = document.getElementById('notif-stack');
  const n = document.createElement('div');
  n.className = 'notif ' + type;
  n.textContent = text;
  stack.appendChild(n);
  setTimeout(()=>{ n.style.opacity='0'; n.style.transition='opacity 0.3s'; setTimeout(()=>n.remove(),300); }, 2800);
}

// ── STREAMING MODEL BUS EXTENSION ─────────────────────────────────────────────
// Patches ModelBus to add .stream() for token-by-token SSE output
// Works with Ollama (native /api/chat stream), LM Studio, and Anthropic
(function patchModelBusStream() {
  const orig = ModelBus;

  ModelBus.stream = async function(messages, opts = {}, onChunk) {
    const cur = ModelBus.getCurrent();
    if (!cur) throw new Error('No model selected');
    const ep = cur.endpoint;

    // ── Anthropic streaming ──
    if (ep.type === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'messages-2023-06-01',
          'x-api-key': opts.apiKey || '',
        },
        body: JSON.stringify({
          model: cur.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || 2048,
          stream: true,
          system: opts.system || '',
          messages,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const j = JSON.parse(raw);
            const delta = j.delta?.text || j.choices?.[0]?.delta?.content || '';
            if (delta) { full += delta; if (onChunk) onChunk(delta, full); }
          } catch (_) {}
        }
      }
      return full;
    }

    // ── Ollama native /api/chat stream ──
    if (ep.type === 'ollama-native') {
      const r = await fetch(`${ep.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cur.model,
          messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
          stream: true,
          options: { num_ctx: 4096 },
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n').filter(Boolean)) {
          try {
            const j = JSON.parse(line);
            const delta = j.message?.content || '';
            if (delta) { full += delta; if (onChunk) onChunk(delta, full); }
            if (j.done) break;
          } catch (_) {}
        }
      }
      return full;
    }

    // ── OpenAI-compat (LM Studio etc) ──
    const sys = opts.system ? [{ role: 'system', content: opts.system }] : [];
    const r = await fetch(`${ep.url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cur.model,
        messages: [...sys, ...messages],
        max_tokens: opts.max_tokens || 2048,
        stream: true,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') continue;
        try {
          const j = JSON.parse(raw);
          const delta = j.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; if (onChunk) onChunk(delta, full); }
        } catch (_) {}
      }
    }
    return full;
  };
})();

// ── SSE BRIDGE CLIENT ──────────────────────────────────────────────────────────
const SSEBridge = (() => {
  const BRIDGE = 'http://localhost:3007';
  let es = null;
  let connected = false;
  let tools = [];
  const listeners = new Map();

  function updatePill(state) {
    const pill = document.getElementById('sse-pill');
    const label = document.getElementById('sse-status-label');
    if (!pill) return;
    if (state === 'connected') {
      pill.textContent = 'SSE ●';
      pill.style.color = 'var(--green)';
      pill.style.borderColor = 'var(--green)';
      if (label) label.textContent = 'connected';
    } else if (state === 'connecting') {
      pill.textContent = 'SSE ◌';
      pill.style.color = 'var(--amber)';
      pill.style.borderColor = 'var(--amber)';
      if (label) label.textContent = 'connecting...';
    } else {
      pill.textContent = 'SSE ○';
      pill.style.color = 'var(--text2)';
      pill.style.borderColor = 'var(--border2)';
      if (label) label.textContent = 'disconnected';
    }
  }

  function appendFeed(evt, data) {
    const feed = document.getElementById('stream-feed');
    if (!feed) return;
    const row = document.createElement('div');
    const t = new Date().toTimeString().slice(0, 8);
    const evtColor = evt === 'thought' ? 'var(--accent)' : evt === 'kernel_delta_proposed' ? 'var(--amber)' : evt === 'mcp_result' ? 'var(--green)' : 'var(--text2)';
    row.style.cssText = 'border-bottom:1px solid var(--border);padding:4px 0;word-break:break-word';
    row.innerHTML = `<span style="color:var(--text2);font-size:9px">${t}</span> <span style="color:${evtColor}">${evt}</span><br><span style="color:var(--text1);font-size:9px">${JSON.stringify(data).slice(0,160)}</span>`;
    feed.prepend(row);
    // keep feed at max 80 rows
    while (feed.children.length > 80) feed.removeChild(feed.lastChild);
  }

  function connect() {
    if (es) { es.close(); es = null; }
    updatePill('connecting');
    cliPrint('info', `SSE: connecting to ${BRIDGE}/axiom-stream`);
    try {
      es = new EventSource(`${BRIDGE}/axiom-stream`);

      es.addEventListener('system', e => {
        connected = true;
        updatePill('connected');
        const d = JSON.parse(e.data);
        cliPrint('ok', `SSE: bridge connected — tools: ${(d.mcpTools || []).join(', ')}`);
        notify('ok', 'SSE bridge connected');
        fetchTools();
        // push scene state to bridge
        postScene();
      });

      ['thought','status','kernel_delta_proposed','kernel_delta','validation','ace_event','mcp_event','mcp_result','scene_updated','heartbeat'].forEach(evt => {
        es.addEventListener(evt, e => {
          const d = JSON.parse(e.data);
          appendFeed(evt, d);
          EventBus.emit('sse:' + evt, d);
          (listeners.get(evt) || []).forEach(fn => fn(d));
        });
      });

      es.onerror = () => {
        connected = false;
        updatePill('disconnected');
        cliPrint('warn', 'SSE: disconnected — retrying in 5s');
        setTimeout(connect, 5000);
      };
    } catch (e) {
      updatePill('disconnected');
      cliPrint('warn', 'SSE: EventSource not available — bridge offline?');
    }
  }

  async function post(event, data) {
    try {
      await fetch(`${BRIDGE}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data }),
      });
    } catch (_) {}
  }

  async function postScene() {
    const state = SceneManager.getSceneState();
    try {
      await fetch(`${BRIDGE}/scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch (_) {}
  }


async function applyClientAction(action) {
  if (!action || !action.type) return null;

  if (["activate_plugin", "deactivate_plugin", "plugin_runtime_status"].includes(action.type)) {
    if (!window.AXIOM_PLUGIN_RUNTIME) {
      const receipt = {
        applied: false,
        ok: false,
        reason: 'plugin_runtime_loader_missing',
        actionType: action.type,
        appliedAt: new Date().toISOString()
      };
      appendFeed('mcp_client_apply_failed', receipt);
      cliPrint('err', `MCP client apply failed → ${action.type}: plugin runtime loader missing`);
      post('mcp_event', { type: 'client_apply_receipt', receipt });
      return receipt;
    }

    const result = await window.AXIOM_PLUGIN_RUNTIME.applyClientAction(action);
    const receipt = {
      applied: !!result?.ok,
      ok: !!result?.ok,
      actionType: action.type,
      plugin_id: action.payload?.plugin_id || null,
      result,
      appliedAt: new Date().toISOString()
    };
    appendFeed(result?.ok ? 'mcp_client_apply' : 'mcp_client_apply_failed', receipt);
    cliPrint(result?.ok ? 'ok' : 'err', `MCP client apply ${result?.ok ? 'ok' : 'failed'} → ${action.type}`);
    if (result?.ok && action.type === 'activate_plugin') notify('ok', `Plugin activated: ${receipt.plugin_id}`);
    if (result?.ok && action.type === 'deactivate_plugin') notify('ok', `Plugin deactivated: ${receipt.plugin_id}`);
    post('mcp_event', { type: 'client_apply_receipt', receipt });
    return receipt;
  }

  if (action.type !== 'create_object') return null;
  const payload = action.payload || {};
  const pos = payload.position || {};
  const opts = {
    name: payload.name,
    x: Number(pos.x || 0),
    y: Number(pos.y || 0),
    z: Number(pos.z || 0)
  };
  const id = payload.type?.includes('light')
    ? SceneManager.addLight(payload.type, opts)
    : SceneManager.addMesh(payload.type || 'cube', opts);
  if (payload.select !== false) SceneManager.selectObject(id);
  const receipt = {
    applied: true,
    ok: true,
    objectId: id,
    type: payload.type,
    name: payload.name,
    position: opts,
    appliedAt: new Date().toISOString()
  };
  appendFeed('mcp_client_apply', receipt);
  cliPrint('ok', `MCP applied create_object → ${payload.type} (${id})`);
  notify('ok', `MCP created ${payload.type}`);
  if (connected) postScene();
  post('mcp_event', { type: 'client_apply_receipt', receipt });
  return receipt;
}

async function call(tool, params = {}) {
  const r = await fetch(`${BRIDGE}/mcp/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params }),
  });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(payload.error || `MCP call failed: ${r.status}`);
  const receipt = await applyClientAction(payload.clientAction);
  if (receipt) {
    payload.result = {
      ...(payload.result || {}),
      applied: !!receipt.applied,
      objectId: receipt.objectId,
      clientApplyReceipt: receipt
    };
  }
  return payload;
}

  async function fetchTools() {
    try {
      const r = await fetch(`${BRIDGE}/mcp/tools`);
      const d = await r.json();
      tools = d.tools || [];
      renderToolList();
    } catch (_) {}
  }

  function renderToolList() {
    const list = document.getElementById('mcp-tool-list');
    const sel = document.getElementById('mcp-tool-select');
    if (!list) return;
    list.innerHTML = tools.map(t => `<div style="padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--accent)">${t.name}</span><br><span style="color:var(--text2);font-size:9px">${t.description}</span></div>`).join('') || '<div style="color:var(--text2)">No tools loaded</div>';
    if (sel) {
      sel.innerHTML = '<option value="">— select tool —</option>' + tools.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    }
  }

  async function quickCall() {
    const tool = document.getElementById('mcp-tool-select')?.value;
    const raw = document.getElementById('mcp-params-input')?.value || '{}';
    const out = document.getElementById('mcp-result-out');
    if (!tool) { notify('warn', 'Select a tool first'); return; }
    let params;
    try { params = JSON.parse(raw); } catch (e) { notify('err', 'Invalid JSON params'); return; }
    if (out) { out.style.display = 'block'; out.textContent = 'calling...'; }
    try {
      const res = await call(tool, params);
      if (out) out.textContent = JSON.stringify(res, null, 2);
      cliPrint('ok', `MCP ${tool}: ${JSON.stringify(res.result).slice(0, 200)}`);
    } catch (e) {
      if (out) out.textContent = `Error: ${e.message}`;
      cliPrint('err', `MCP ${tool}: ${e.message}`);
    }
  }

  function toggle() { connect(); }

  // Auto-sync scene to bridge when objects change
  EventBus.on('scene:objectAdded', () => { if (connected) postScene(); });
  EventBus.on('scene:objectRemoved', () => { if (connected) postScene(); });
  EventBus.on('scene:selectionChanged', () => { if (connected) postScene(); });

  return { connect, toggle, post, call, fetchTools, quickCall, get tools() { return tools; }, isConnected: () => connected, bridgeUrl: BRIDGE };
})();
window.SSEBridge = SSEBridge;

// ── CLI MCP COMMANDS ───────────────────────────────────────────────────────────
// Extend CLIRuntime with mcp and sse commands after it's defined
// (injected at runtime via the parse override below)
const _origParse = CLIRuntime.parse.bind(CLIRuntime);
CLIRuntime.parse = function(input) {
  const parts = (input || '').trim().split(/\s+/);
  const cmd = parts[0].replace(/^\//, '');
  const args = parts.slice(1);

  if (cmd === 'mcp') {
    const sub = args[0];
    if (!sub || sub === 'tools') {
      const ts = SSEBridge.tools;
      if (!ts.length) { cliPrint('warn', 'No MCP tools loaded. Connect bridge first: sse connect'); return; }
      ts.forEach(t => cliPrint('info', `${t.name} — ${t.description}`));
    } else if (sub === 'call') {
      const tool = args[1];
      let params = {};
      try { params = args[2] ? JSON.parse(args.slice(2).join(' ')) : {}; } catch (_) {}
      if (!tool) { cliPrint('err', 'Usage: mcp call <tool> [json-params]'); return; }
      cliPrint('info', `Calling: ${tool}...`);
      SSEBridge.call(tool, params).then(r => {
        cliPrint('ok', JSON.stringify(r.result, null, 2).slice(0, 800));
      }).catch(e => cliPrint('err', e.message));
    } else if (sub === 'grep') {
      const pattern = args[1]; const p = args[2] || '.';
      if (!pattern) { cliPrint('err', 'Usage: mcp grep <pattern> [path]'); return; }
      cliPrint('info', `grep "${pattern}" in ${p}...`);
      SSEBridge.call('fs_grep', { pattern, path: p, maxLines: 50 }).then(r => {
        (r.result?.lines || []).forEach(l => cliPrint('out', l));
        if (r.result?.truncated) cliPrint('warn', '(results truncated)');
      }).catch(e => cliPrint('err', e.message));
    } else if (sub === 'find') {
      const p = args[1] || '.'; const name = args[2];
      cliPrint('info', `find ${p}${name ? ` -name ${name}` : ''}...`);
      SSEBridge.call('fs_find', { path: p, name }).then(r => {
        (r.result?.entries || []).forEach(e => cliPrint('out', e));
      }).catch(e => cliPrint('err', e.message));
    } else if (sub === 'cat') {
      const p = args[1];
      if (!p) { cliPrint('err', 'Usage: mcp cat <file>'); return; }
      SSEBridge.call('fs_cat', { path: p, lines: 100 }).then(r => {
        if (r.result?.error) { cliPrint('err', r.result.error); return; }
        cliPrint('out', r.result?.content || '');
      }).catch(e => cliPrint('err', e.message));
    } else if (sub === 'ls') {
      SSEBridge.call('fs_ls', { path: args[1] || '.', long: true }).then(r => {
        (r.result?.entries || []).forEach(e => cliPrint('out', e));
      }).catch(e => cliPrint('err', e.message));
    } else if (sub === 'jq') {
      const query = args[1]; const file = args[2];
      if (!query) { cliPrint('err', 'Usage: mcp jq <query> [file]'); return; }
      SSEBridge.call('fs_jq', { query, file }).then(r => {
        if (r.result?.error) cliPrint('err', r.result.error);
        else cliPrint('out', r.result?.result || '');
      }).catch(e => cliPrint('err', e.message));
    } else if (sub === 'exec') {
      const execCmd = args[1]; const execArgs = args.slice(2);
      if (!execCmd) { cliPrint('err', 'Usage: mcp exec <cmd> [args...]'); return; }
      SSEBridge.call('shell_exec', { cmd: execCmd, args: execArgs }).then(r => {
        if (r.result?.stdout) cliPrint('out', r.result.stdout);
        if (r.result?.stderr) cliPrint('warn', r.result.stderr);
        if (r.result?.error) cliPrint('err', r.result.error);
      }).catch(e => cliPrint('err', e.message));
    } else {
      cliPrint('err', 'mcp sub-commands: tools | call <tool> [params] | grep | find | cat | ls | jq | exec');
    }
    return;
  }

  if (cmd === 'sse') {
    const sub = args[0];
    if (!sub || sub === 'connect') { SSEBridge.connect(); }
    else if (sub === 'status') { cliPrint(SSEBridge.isConnected() ? 'ok' : 'warn', `SSE: ${SSEBridge.isConnected() ? 'connected' : 'disconnected'}`); }
    else if (sub === 'post') {
      const evt = args[1]; const data = args.slice(2).join(' ');
      if (!evt) { cliPrint('err', 'Usage: sse post <event> [json-data]'); return; }
      let d = {};
      try { d = data ? JSON.parse(data) : {}; } catch (_) {}
      SSEBridge.post(evt, d).then(() => cliPrint('ok', `Posted: ${evt}`));
    } else if (sub === 'scene') {
      cliPrint('info', 'Pushing scene state to bridge...');
      SSEBridge.call('axiom_get_scene', {}).then(r => cliPrint('out', JSON.stringify(r.result,null,2).slice(0,400)));
    }
    return;
  }

  _origParse(input);
};

// ── CSS for streaming cursor ───────────────────────────────────────────────────
(function() {
  const style = document.createElement('style');
  style.textContent = `@keyframes blink-cur{0%,100%{opacity:1}50%{opacity:0}} .stream-cur{color:var(--accent)}`;
  document.head.appendChild(style);
})();

async function boot(){
  cliPrint('ok', '╔═══════════════════════════════════════╗');
  cliPrint('ok', '║  AXIOM AI GAME EDITOR  v0.2.0         ║');
  cliPrint('ok', '║  + SSE Streaming  + MCP Tool Layer    ║');
  cliPrint('ok', '╚═══════════════════════════════════════╝');
  cliPrint('info', 'Initializing Three.js viewport...');
  SceneManager.init();
  cliPrint('ok', 'Viewport ready.');
  CLIRuntime.bindInput();
  cliPrint('ok', 'CLI ready. Type /help');
  renderPluginList();
  PluginRegistry.register('axiom-core', { name:'Axiom Core', active:true, init(editor){ editor.events.on('scene:objectAdded', d=>{}); } });
  cliPrint('info', 'Starting model bus scan...');
  await ModelBus.scan();
  cliPrint('ok', 'Boot complete. window.EDITOR available.');
  cliPrint('info', 'New in v0.2: SSE streaming | MCP tool layer | token-by-token chat');
  cliPrint('info', 'Bridge: start server.js then type: sse connect');
  cliPrint('info', 'MCP CLI: mcp grep <pat> [path] | mcp find [path] [name] | mcp ls | mcp cat <file> | mcp jq <q> <file> | mcp exec <cmd>');

  // Attempt bridge connection silently
  SSEBridge.connect();

  document.getElementById('chat-messages').innerHTML = '';
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = `<div class="sender">AXIOM AI</div>AXIOM v0.2 ready.<br><br><strong>What's new:</strong><br>• Token-by-token streaming from any local model<br>• MCP tool layer — grep, find, jq, cat, ls, shell_exec<br>• Chat can now call MCP tools and print receipts<br>• SSE live event feed (see Stream tab)<br><br>Start the bridge: <code>node server.js</code> then <code>sse connect</code><br>Chat shortcut: <code>/mcp fs_ls {"path":"."}</code><br>Natural language: <code>create a sphere at 2 0.5 0</code>`;
  msgs.appendChild(div);
}

boot();
