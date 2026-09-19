import * as THREE from 'three';
// @ts-ignore
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class VoyagerProbe {
  private scene: THREE.Scene;
  public mesh: THREE.Group;
  private label!: CSS2DObject;
  private center = new THREE.Vector3(0, 0, 0);
  private startPosition = new THREE.Vector3(8000, 4000, -8000);
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();
    this.mesh.userData = { isVoyager: true, name: 'Voyager-1', type: 'Deep Space Probe' };

    this.buildMesh();
    this.createLabel();

    // Set initial position
    this.mesh.position.copy(this.startPosition);
    this.scene.add(this.mesh);

    // Initial telemetry update
    this.updateTelemetry();
    // Update telemetry text every second
    setInterval(() => this.updateTelemetry(), 1000);
  }

  public update(dt: number, cameraPosition: THREE.Vector3) {
    this.elapsed += dt;

    // Drifting slowly through deep space to simulate interstellar escape trajectory
    const driftSpeed = 2.0; // Slow space glide
    this.mesh.position.x += Math.sin(this.elapsed * 0.02) * driftSpeed * dt;
    this.mesh.position.y += Math.cos(this.elapsed * 0.01) * driftSpeed * dt;
    this.mesh.position.z -= driftSpeed * 2 * dt; // Escaping outward

    // Orient dish toward Earth (which is at the center 0,0,0)
    this.mesh.lookAt(this.mesh.parent!.localToWorld(this.center.clone()));
    // Rotate dish slightly to keep receiver aligned
    this.mesh.rotateY(Math.PI); // Flip 180 so parabolic dish faces the center (Earth)

    if (!this.label) return;
    const dist = this.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(cameraPosition);

    // Show label only when within scanning range
    this.label.visible = dist < 5000;

    // Pulse beacon glow
    const beacon = this.mesh.children[5] as THREE.Mesh;
    if (beacon && beacon.material instanceof THREE.MeshBasicMaterial) {
      beacon.material.opacity = 0.4 + Math.sin(this.elapsed * 5) * 0.6;
    }
  }

  private buildMesh() {
    // 1. Bus Core (Decagon structure)
    const busGeo = new THREE.CylinderGeometry(20, 20, 30, 10);
    const busMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.5 });
    const bus = new THREE.Mesh(busGeo, busMat);
    bus.rotation.x = Math.PI / 2;
    this.mesh.add(bus);

    // 2. Giant High-Gain Antenna (White parabolic dish facing center)
    const dishGeo = new THREE.CylinderGeometry(60, 5, 20, 24, 1, true);
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, side: THREE.DoubleSide, metalness: 0.2, roughness: 0.8 });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.z = 15; // Placed at the front
    dish.rotation.x = Math.PI / 2;
    this.mesh.add(dish);

    // Antenna feed horn
    const feedGeo = new THREE.CylinderGeometry(2, 2, 25, 8);
    const feedMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8 });
    const feed = new THREE.Mesh(feedGeo, feedMat);
    feed.position.z = 30;
    feed.rotation.x = Math.PI / 2;
    this.mesh.add(feed);

    // Feed struts (tripod support)
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const strutGeo = new THREE.CylinderGeometry(0.5, 0.5, 35, 4);
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.position.set(Math.cos(angle) * 15, Math.sin(angle) * 15, 20);
      strut.rotation.z = -angle;
      strut.rotation.x = -0.4;
      this.mesh.add(strut);
    }

    // 3. RTG Power Source Strut (Plutonium generators)
    const rtgGroup = new THREE.Group();
    const rtgBoomGeo = new THREE.BoxGeometry(4, 4, 100);
    const boomMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const rtgBoom = new THREE.Mesh(rtgBoomGeo, boomMat);
    rtgBoom.position.set(-60, 0, -20);
    rtgBoom.rotation.y = 0.5;
    rtgGroup.add(rtgBoom);

    // Three RTG canisters
    const canisterGeo = new THREE.CylinderGeometry(8, 8, 25, 8);
    const canisterMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    for (let i = 0; i < 3; i++) {
      const canister = new THREE.Mesh(canisterGeo, canisterMat);
      canister.position.set(-110, 0, -40 + i * 15);
      canister.rotation.x = Math.PI / 2;
      rtgGroup.add(canister);
    }
    this.mesh.add(rtgGroup);

    // 4. Golden Record (The Message to Outer Space!)
    const goldRecordGeo = new THREE.CylinderGeometry(12, 12, 1, 24);
    const goldRecordMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Gold metallic
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xd4af37,
      emissiveIntensity: 0.1
    });
    const goldRecord = new THREE.Mesh(goldRecordGeo, goldRecordMat);
    goldRecord.position.set(22, 10, -5);
    goldRecord.rotation.y = Math.PI / 2; // Flat on the bus side
    this.mesh.add(goldRecord);

    // 5. Magnetometer Boom (Extends far in opposite direction)
    const magBoomGeo = new THREE.BoxGeometry(2, 2, 180);
    const magBoom = new THREE.Mesh(magBoomGeo, boomMat);
    magBoom.position.set(70, -10, -80);
    magBoom.rotation.y = -0.3;
    this.mesh.add(magBoom);

    // Sensor pack at the tip
    const sensorGeo = new THREE.BoxGeometry(10, 10, 10);
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x99ddff, emissive: 0x0066cc });
    const sensor = new THREE.Mesh(sensorGeo, sensorMat);
    sensor.position.set(130, -25, -160);
    this.mesh.add(sensor);

    // Red telemetry beacon LED
    const beaconGeo = new THREE.SphereGeometry(6, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.8 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 25, 0);
    this.mesh.add(beacon);

    // 6. Giant invisible collision/scanning hitbox
    const hitBoxGeo = new THREE.BoxGeometry(450, 450, 450);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitbox.userData = { ...this.mesh.userData, radius: 280 };
    this.mesh.add(hitbox);
  }

  private createLabel() {
    const div = document.createElement('div');
    div.className = 'bot-label';
    div.style.color = '#00ffcc';
    div.style.border = '1px solid #00ffcc';
    div.style.background = 'rgba(0,15,30,0.85)';
    div.style.boxShadow = '0 0 10px rgba(0,255,200,0.3)';
    div.textContent = 'VOYAGER-1 (Scanning Signal...)';

    this.label = new CSS2DObject(div);
    this.label.position.set(0, 220, 0);
    this.mesh.add(this.label);
  }

  private updateTelemetry() {
    // Exact mathematical formula starting from launch: Sep 5, 1977
    const launchTime = new Date('1977-09-05T12:56:00Z').getTime();
    const curTime = Date.now();
    const elapsedSeconds = (curTime - launchTime) / 1000;

    // Speed relative to Sun is roughly 16.999 km/s
    const kmPerSecond = 16.999;
    const baseDistanceKM = elapsedSeconds * kmPerSecond;
    const currentDistanceKM = baseDistanceKM + (Math.sin(curTime * 0.001) * 50); // slight earth orbit variance

    // Convert to Astronomical Units (1 AU = 149,597,870.7 km)
    const au = currentDistanceKM / 149597870.7;

    // Round trip light time delay (Speed of light: 299,792.458 km/s)
    const lightDelayHours = (currentDistanceKM * 2) / (299792.458 * 3600);

    // Plutonium-238 RTG Decay (Halflife 87.7 years, starts at 470W, loses roughly 4.2W/year)
    const elapsedYears = elapsedSeconds / (365.25 * 24 * 3600);
    const rtgPower = Math.max(0, 470 - elapsedYears * 4.28);

    // Format metrics
    const distanceFormatted = (currentDistanceKM / 1e9).toFixed(5);

    if (this.label && this.label.element) {
      (this.label.element as HTMLElement).innerHTML = `
        <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:#00ffcc;letter-spacing:1px;text-align:left;">
          <span style="color:#ffaa00;">[ DEEP SPACE TELEMETRY ]</span><br>
          <b>VOYAGER-1</b><br>
          <span style="color:#88aacc;">Dist:</span> ${distanceFormatted}B km (${au.toFixed(4)} AU)<br>
          <span style="color:#88aacc;">RTT Delay:</span> ${lightDelayHours.toFixed(4)} hrs<br>
          <span style="color:#88aacc;">RTG Power:</span> ${rtgPower.toFixed(2)} W<br>
          <span style="color:#88aacc;">Status:</span> INTERSTELLAR TRANSIT
        </div>
      `;
    }
  }
}
