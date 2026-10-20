import * as THREE from 'three';

/** Third-person follow camera and restrained, time-based boost/impact effects. */
export class CameraEffects {
  constructor(camera, { enabled = true } = {}) {
    this.camera = camera; this.enabled = enabled; this.baseFov = camera.fov; this.shakeRemaining = 0; this.shakeStrength = 0; this.elapsed = 0;
    this.offset = new THREE.Vector3(0, 5.4, 10.5); this.lookOffset = new THREE.Vector3(0, 1.1, -2.6); this.desired = new THREE.Vector3(); this.lookTarget = new THREE.Vector3();
  }
  setEnabled(enabled) { this.enabled = Boolean(enabled); if (!this.enabled) { this.shakeRemaining = 0; this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); } }
  hit(strength = 0.16) { if (this.enabled) { this.shakeRemaining = Math.max(this.shakeRemaining, 0.2); this.shakeStrength = Math.max(this.shakeStrength, Math.min(0.32, strength)); } }
  update(dt, target, yaw = 0, boosting = false) {
    if (!target) return;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    this.desired.set(target.x + s * this.offset.z, target.y + this.offset.y, target.z + c * this.offset.z);
    this.desired.x += -c * this.offset.x; this.desired.z += s * this.offset.x;
    this.camera.position.lerp(this.desired, 1 - Math.exp(-5.5 * dt));
    this.lookTarget.set(target.x + s * this.lookOffset.z, target.y + this.lookOffset.y, target.z + c * this.lookOffset.z);
    this.camera.lookAt(this.lookTarget);
    if (this.enabled) {
      this.elapsed += dt;
      const desiredFov = this.baseFov + (boosting ? 8 : 0);
      this.camera.fov += (desiredFov - this.camera.fov) * (1 - Math.exp(-5 * dt));
      if (this.shakeRemaining > 0) {
        this.shakeRemaining = Math.max(0, this.shakeRemaining - dt);
        const fade = this.shakeRemaining / 0.2;
        this.camera.position.x += Math.sin(this.elapsed * 83) * this.shakeStrength * fade;
        this.camera.position.y += Math.cos(this.elapsed * 71) * this.shakeStrength * 0.5 * fade;
        if (this.shakeRemaining === 0) this.shakeStrength = 0;
      }
      this.camera.updateProjectionMatrix();
    }
  }
}
