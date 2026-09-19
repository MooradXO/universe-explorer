import * as THREE from 'three';

export function createPlanetRimMaterial(colorHex: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float cosTheta = abs(dot(normal, viewDir));
        float intensity = pow(1.0 - cosTheta, 2.8);
        vec3 lightDir = vec3(0.57735, 0.57735, 0.57735);
        float dotNL = dot(normal, lightDir);
        float lightTerminator = smoothstep(-0.3, 0.4, dotNL);
        vec3 sunsetColor = vec3(1.0, 0.45, 0.08);
        float sunsetBlend = smoothstep(0.35, 0.0, abs(dotNL - 0.05));
        vec3 finalColor = mix(uColor, sunsetColor, sunsetBlend * 0.72);
        gl_FragColor = vec4(finalColor, intensity * lightTerminator * 0.85);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
    },
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
}
