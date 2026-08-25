import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = path.join(projectRoot, 'assets', 'models', 'mama', 'dragon_main_march_v5_flyover.glb');
const outputPath = path.join(projectRoot, 'assets', 'models', 'mama', 'dragon_main_march_v5_flyover_lod1.glb');
const targetVertexCount = 8_000;

installFileReaderPolyfill();
const source = await readFile(sourcePath);
const sourceBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(sourceBuffer, '', resolve, reject));
const meshes = [];
gltf.scene.traverse((object) => { if (object.isMesh) meshes.push(object); });
if (meshes.length !== 1) throw new Error(`mama_flyover_lod_source_mesh_count:${meshes.length}`);

const mesh = meshes[0];
const sourceVertices = mesh.geometry.attributes.position.count;
const removeCount = Math.max(0, sourceVertices - targetVertexCount);
const simplified = new SimplifyModifier().modify(mesh.geometry, removeCount);
simplified.computeVertexNormals();
simplified.computeBoundingBox();
simplified.computeBoundingSphere();
mesh.geometry = simplified;
gltf.scene.userData = {
  contract: 'black-sky-bound.mama-flyover-runtime-lod.v1',
  sourceAsset: path.basename(sourcePath),
  sourceVertexCount: sourceVertices,
  sourceTriangleCount: 62_848,
  targetVertexCount,
  runtimeVertexCount: simplified.attributes.position.count,
  runtimeTriangleCount: (simplified.index?.count ?? simplified.attributes.position.count) / 3,
  generationPolicy: 'three_simplify_modifier_offline_bake_preserve_original_source_glb'
};

const binary = await new GLTFExporter().parseAsync(gltf.scene, { binary: true, onlyVisible: false });
await writeFile(outputPath, new Uint8Array(binary));
console.log(JSON.stringify({
  sourcePath,
  outputPath,
  sourceBytes: source.byteLength,
  outputBytes: binary.byteLength,
  sourceVertices,
  runtimeVertices: simplified.attributes.position.count,
  runtimeTriangles: (simplified.index?.count ?? simplified.attributes.position.count) / 3
}, null, 2));

function installFileReaderPolyfill() {
  if (globalThis.FileReader) return;
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      }).catch((error) => this.onerror?.(error));
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;
        this.onloadend?.();
      }).catch((error) => this.onerror?.(error));
    }
  };
}
