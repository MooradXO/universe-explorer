import * as THREE from 'three';
import gsap from 'gsap';
// @ts-ignore
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class ISSSatellite {
    private scene: THREE.Scene;
    public mesh: THREE.Group;
    private label!: CSS2DObject;
    private orbitRadius = 8000;
    private center = new THREE.Vector3(0, 0, 0); // Re-center dynamically if needed

    constructor(scene: THREE.Scene, orbitRadius: number) {
        this.scene = scene;
        this.orbitRadius = orbitRadius;
        this.mesh = new THREE.Group();
        this.mesh.userData = { isISS: true, name: 'ISS (Live)', type: 'NASA Telemetry' };
        
        this.buildMesh();
        this.createLabel();
        
        this.scene.add(this.mesh);
        
        // External telemetry is optional; use a restrained polling interval.
        this.pollNASA();
        setInterval(() => this.pollNASA(), 15000);
    }
    
    public update(cameraPosition: THREE.Vector3) {
        if (!this.label) return;
        const dist = this.mesh.position.distanceTo(cameraPosition);
        
        // Hide entire object from rendering rather than HTML display block string parsing
        this.label.visible = dist < 4000;
        
        // Hide beacon at long distances if needed
        const beacon = this.mesh.children[2] as THREE.Mesh;
        if (beacon) beacon.visible = dist < 20000;
    }

    private buildMesh() {
        // Core module (cylinder)
        const coreGeo = new THREE.CylinderGeometry(15, 15, 100, 16);
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.rotation.x = Math.PI / 2;
        this.mesh.add(core);

        // Solar panels
        const panelGeo = new THREE.BoxGeometry(200, 5, 60);
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x0044ff, metalness: 0.9, roughness: 0.1 });
        const panels = new THREE.Mesh(panelGeo, panelMat);
        this.mesh.add(panels);
        
        // Neon beacon
        const beaconGeo = new THREE.SphereGeometry(8, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = 20;
        this.mesh.add(beacon);

        // Add a giant invisible hitbox
        const hitBoxGeo = new THREE.BoxGeometry(400, 400, 400);
        const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitbox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
        hitbox.userData = { ...this.mesh.userData, radius: 250 };
        this.mesh.add(hitbox);
    }

    private createLabel() {
        const div = document.createElement('div');
        div.className = 'bot-label'; // Re-use styling
        div.style.color = '#ffaa00';
        div.style.border = '1px solid #ff3333';
        div.style.background = 'rgba(20,0,0,0.8)';
        div.textContent = 'ISS (Connecting...)';
        
        this.label = new CSS2DObject(div);
        this.label.position.set(0, 150, 0);
        this.mesh.add(this.label);
    }

    private async pollNASA() {
        try {
            // Using wheretheiss.at for HTTPS support
            const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
            if (!res.ok) throw new Error(`ISS telemetry HTTP ${res.status}`);
            const data = await res.json();
            
            if (data.latitude !== undefined && data.longitude !== undefined) {
                this.updatePosition(data.latitude, data.longitude, data.velocity);
            }
        } catch {
            (this.label.element as HTMLElement).textContent = 'ISS / TELEMETRY STANDBY';
        }
    }

    private updatePosition(lat: number, lon: number, vel: number) {
        // Convert Lat/Lon to 3D Sphere Coordinates
        // In ThreeJS: Y is up. X and Z are the horizontal plane.
        
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);

        const targetX = -(this.orbitRadius * Math.sin(phi) * Math.cos(theta));
        const targetZ = (this.orbitRadius * Math.sin(phi) * Math.sin(theta));
        const targetY = (this.orbitRadius * Math.cos(phi));
        
        const targetPos = new THREE.Vector3(targetX, targetY, targetZ).add(this.center);

        // Animate smoothly to new position over 5 seconds
        gsap.to(this.mesh.position, {
            x: targetPos.x,
            y: targetPos.y,
            z: targetPos.z,
            duration: 5,
            ease: "linear",
            onUpdate: () => {
                 this.mesh.lookAt(this.center);
            }
        });

        // Update Label
        (this.label.element as HTMLElement).innerHTML = `
            <b>ISS (Live)</b><br>
            Lat: ${lat.toFixed(2)}°<br>
            Lon: ${lon.toFixed(2)}°<br>
            Vel: ${Math.floor(vel)} km/h
        `;

        window.dispatchEvent(new CustomEvent('ISSPositionUpdated', {
            detail: { lat, lon, vel, position: targetPos }
        }));
    }
}
