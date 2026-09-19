export const vertexShader=`
attribute vec3 fxPosition;
attribute vec3 fxSize;
attribute vec4 fxQuaternion;
attribute vec4 fxColor;
attribute vec3 fxVelocity;
attribute float fxAngle;
attribute float fxFrame;
uniform float renderMode;
uniform float alignment;
uniform float lengthScale;
uniform float velocityScale;
uniform vec2 tiles;
uniform vec2 uvScale;
uniform vec2 uvOffset;
uniform vec3 pivot;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vViewPosition;
vec3 qrot(vec4 q,vec3 v){return v+2.0*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){
  vColor=fxColor;
  vec2 cell=vec2(mod(fxFrame,tiles.x),tiles.y-1.0-floor(fxFrame/tiles.x));
  vUv=((uv+cell)/tiles)*uvScale+uvOffset;
  vec3 p=position+pivot;
  vec3 world=(modelMatrix*vec4(fxPosition,1.0)).xyz;
  vec3 scale=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
  vec3 size=fxSize*scale;
  vec4 mv=viewMatrix*vec4(world,1.0);
  float c=cos(fxAngle),s=sin(fxAngle);
  vec2 rotated=mat2(c,s,-s,c)*p.xy;
  if(renderMode>3.5 || alignment>0.5){
    vec3 local=qrot(fxQuaternion,p*fxSize);
    mv=viewMatrix*vec4(world+mat3(modelMatrix)*local,1.0);
  }else if(renderMode>1.5 && renderMode<2.5){
    mv=viewMatrix*vec4(world+vec3(rotated.x*size.x,0.0,rotated.y*size.y),1.0);
  }else if(renderMode>2.5 && renderMode<3.5){
    vec3 right=normalize(vec3(viewMatrix[0][0],0.0,viewMatrix[2][0]));
    mv=viewMatrix*vec4(world+right*rotated.x*size.x+vec3(0.0,rotated.y*size.y,0.0),1.0);
  }else if(renderMode>0.5 && renderMode<1.5){
    vec3 vel=(viewMatrix*modelMatrix*vec4(fxVelocity,0.0)).xyz;
    vec2 up=length(vel.xy)>.001?normalize(vel.xy):vec2(0.0,1.0);
    vec2 right=vec2(up.y,-up.x);
    float len=size.y*max(lengthScale,.01)+length(vel)*velocityScale;
    mv.xy+=right*p.x*size.x+up*p.y*len;
  }else{mv.xy+=rotated*size.xy;}
  vNormal=normalize(normalMatrix*qrot(fxQuaternion,normal));
  vViewPosition=-mv.xyz;
  gl_Position=projectionMatrix*mv;
}`;
export const fragmentShader=`
uniform sampler2D map;
uniform vec4 tint;
uniform float intensity;
uniform float lit;
uniform vec3 recolor;
uniform float colorize;
uniform float powerbox;
uniform sampler2D iconMap;
uniform sampler2D backgroundMap;
uniform vec4 iconTint;
uniform vec4 backgroundTint;
uniform vec4 backgroundST;
uniform vec4 iconSettings;
uniform vec2 iconOffset;
uniform vec2 backgroundSettings;
uniform vec2 surfaceSettings;
uniform sampler2D sceneDepth;
uniform vec2 viewport;
uniform vec2 cameraRange;
uniform vec2 softRange;
uniform float useSoftDepth;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main(){
  vec4 texel=texture2D(map,vUv);
  vec4 col=texel*vColor*tint;
  if(powerbox>.5){
    vec4 icon=texture2D(iconMap,vUv*iconSettings.x+iconOffset);
    vec3 bg=pow(max(texture2D(backgroundMap,vUv*backgroundST.xy+backgroundST.zw).rgb,vec3(0.0)),vec3(backgroundSettings.x))*backgroundTint.rgb*backgroundSettings.y*vColor.rgb;
    vec3 symbol=pow(max(icon.rgb+iconTint.rgb,vec3(0.0)),vec3(iconSettings.y))*iconSettings.z;
    col=vec4(mix(bg,symbol,icon.a),1.0)*tint;
  }
  if(useSoftDepth>.5){
    float depth=texture2D(sceneDepth,gl_FragCoord.xy/viewport).x;
    float distanceToSurface=-(cameraRange.x*cameraRange.y)/((cameraRange.y-cameraRange.x)*depth-cameraRange.y)-vViewPosition.z;
    col.a*=clamp((distanceToSurface-softRange.x)/max(.001,softRange.y-softRange.x),0.0,1.0);
  }
  if(colorize>.5){float luminance=dot(col.rgb,vec3(.2126,.7152,.0722));col.rgb=recolor*luminance/max(.08,dot(recolor,vec3(.2126,.7152,.0722)));}
  if(col.a<.001)discard;
  float lighting=mix(1.0,.55+.45*max(0.0,dot(normalize(vNormal),normalize(vec3(.4,.8,.6)))),lit);
  if(powerbox>.5&&lit>.5){float shine=pow(max(0.0,dot(normalize(vNormal),normalize(normalize(vViewPosition)+normalize(vec3(.4,.8,.6))))),mix(4.0,128.0,surfaceSettings.x));col.rgb+=mix(vec3(.04),col.rgb,surfaceSettings.y)*shine*2.0;}
  gl_FragColor=vec4(col.rgb*intensity*lighting,col.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
