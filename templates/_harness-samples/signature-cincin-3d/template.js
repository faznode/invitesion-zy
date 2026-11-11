(() => {
  // A minimal, dependency-free glTF viewer: one primitive (POSITION, NORMAL, uint16 indices), one light, drag to turn.
  // Nothing loads until the guest asks for it; the fallback image stays if WebGL or the fetch is unavailable.
  const MODEL_URL = 'assets/model/rings.gltf';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = document.querySelector('[data-stage]');
  const button = document.querySelector('[data-load-3d]');
  if (!stage || !button) return;

  const perspective = (fov, aspect, near, far) => {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  };
  const multiply = (a, b) => {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    return out;
  };
  const rotateY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const rotateX = (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];

  const decode = (gltf) => {
    const uri = gltf.buffers[0].uri;
    const binary = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer;
    const read = (index) => {
      const accessor = gltf.accessors[index];
      const view = gltf.bufferViews[accessor.bufferView];
      const Type = accessor.componentType === 5126 ? Float32Array : Uint16Array;
      return new Type(binary, (view.byteOffset || 0) + (accessor.byteOffset || 0), accessor.count * (accessor.type === 'VEC3' ? 3 : 1));
    };
    const primitive = gltf.meshes[0].primitives[0];
    const color = gltf.materials?.[0]?.pbrMetallicRoughness?.baseColorFactor || [0.86, 0.6, 0.5, 1];
    return { positions: read(primitive.attributes.POSITION), normals: read(primitive.attributes.NORMAL), indices: read(primitive.indices), color };
  };

  const compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader');
    return shader;
  };

  const start = (mesh) => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) throw new Error('WebGL unavailable');
    const size = Math.round(stage.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = size;
    canvas.height = size;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', button.dataset.label || '');

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec3 n;uniform mat4 m;uniform mat4 pr;varying vec3 vn;void main(){vn=mat3(m)*n;gl_Position=pr*vec4((m*vec4(p,1.0)).xyz+vec3(0.0,0.0,-3.0),1.0);}'));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec4 c;varying vec3 vn;void main(){vec3 N=normalize(vn);vec3 L=normalize(vec3(0.4,0.8,0.6));float d=max(dot(N,L),0.0);float s=pow(max(dot(N,normalize(L+vec3(0.0,0.0,1.0))),0.0),48.0);gl_FragColor=vec4(c.rgb*(0.35+0.65*d)+vec3(s*0.55),1.0);}'));
    gl.linkProgram(program);
    gl.useProgram(program);

    const attribute = (name, data) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
    };
    attribute('p', mesh.positions);
    attribute('n', mesh.normals);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'pr'), false, perspective(0.8, 1, 0.1, 10));
    gl.uniform4fv(gl.getUniformLocation(program, 'c'), mesh.color);
    gl.enable(gl.DEPTH_TEST);
    gl.viewport(0, 0, size, size);

    let angle = 0.6;
    let dragging = null;
    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'm'), false, multiply(rotateY(angle), rotateX(0.35)));
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    };
    canvas.addEventListener('pointerdown', (event) => {
      dragging = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (dragging === null) return;
      angle += (event.clientX - dragging) * 0.01;
      dragging = event.clientX;
      if (reduceMotion) draw();
    });
    canvas.addEventListener('pointerup', () => {
      dragging = null;
    });

    stage.replaceChildren(canvas);
    if (reduceMotion) {
      draw();
      return;
    }
    const loop = () => {
      if (dragging === null) angle += 0.006;
      draw();
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = button.dataset.loading || '';
    try {
      const response = await fetch(MODEL_URL);
      if (!response.ok) throw new Error(String(response.status));
      start(decode(await response.json()));
      button.textContent = button.dataset.ready || '';
    } catch {
      button.disabled = false;
      button.textContent = button.dataset.failed || '';
    }
  });
})();
