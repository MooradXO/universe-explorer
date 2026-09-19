export const StarShaders = {
  vertex: `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float time;
    
    // Simple 3D noise
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    
    // Classic Simplex 3D Noise 
    // by Ian McEwan, Ashima Arts
    float snoise(vec3 v){ 
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
      i = mod(i, 289.0 ); 
      vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 1.41421356;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
      vUv = uv;
      vPosition = position;
      vec3 pos = position;
      // Clean, low-amplitude displacement
      float noiseVal = snoise(pos * 0.15 + time * 0.3);
      pos += normal * (noiseVal * 0.8);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragment: `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float time;
    uniform vec3 color;
    
    void main() {
      // Smooth intensity logic with strict clamp to prevent overglow glitch
      vec3 lightGlow = color * (0.9 + 0.1 * sin(time * 3.0));
      float edgeGlow = pow(1.0 - abs(dot(normalize(vPosition), vec3(0,0,1))), 2.0);
      vec3 finalColor = clamp(lightGlow + color * edgeGlow * 0.5, 0.0, 1.2); // clamped at 1.2 to prevent insane bloom
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

export const RingShaders = {
  vertex: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    varying vec2 vUv;
    uniform vec3 ringColor;
    
    float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }

    void main() {
      vec2 center = vec2(0.5);
      float dist = distance(vUv, center);
      if (dist < 0.2 || dist > 0.5) discard;
      
      float bands = sin(dist * 100.0);
      float grain = rand(vUv * 100.0);
      
      float alpha = smoothstep(0.2, 0.3, dist) * smoothstep(0.5, 0.4, dist);
      alpha *= clamp(bands + grain * 0.5, 0.0, 1.0);
      
      gl_FragColor = vec4(ringColor, alpha * 0.8);
    }
  `
};

export const BlackHoleShaders = {
  vertex: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    varying vec2 vUv;
    uniform float time;
    
    void main() {
      vec2 center = vec2(0.5);
      float dist = distance(vUv, center);
      
      if (dist < 0.2) {
        // Event horizon
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else if (dist < 0.5) {
        // Accretion disk
        float disk = sin(dist * 40.0 - time * 5.0) * 0.5 + 0.5;
        float alpha = smoothstep(0.5, 0.2, dist) * disk;
        vec3 color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.8, 0.5), dist * 2.0);
        gl_FragColor = vec4(color, alpha);
      } else {
        discard;
      }
    }
  `
};
