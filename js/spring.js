/**
 * Spicy Lyrics Web — Spring Physics
 * Critically-damped spring for smooth animations.
 * Port of @spikerko/web-modules/Spring
 */

export default class Spring {
  constructor(initialValue, frequency = 1, damping = 0.5) {
    this.value = initialValue;
    this.goal = initialValue;
    this.velocity = 0;
    this.frequency = frequency;
    this.damping = damping;
  }

  SetGoal(goal, immediate = false) {
    this.goal = goal;
    if (immediate) {
      this.value = goal;
      this.velocity = 0;
    }
  }

  Step(deltaTime) {
    // Critically-damped spring physics
    const omega = this.frequency * 2 * Math.PI;
    const dampingRatio = this.damping;
    const displacement = this.value - this.goal;

    // Spring force calculations
    const springForce = -omega * omega * displacement;
    const dampingForce = -2 * dampingRatio * omega * this.velocity;
    const acceleration = springForce + dampingForce;

    this.velocity += acceleration * deltaTime;
    this.value += this.velocity * deltaTime;

    // Settle when close enough
    if (Math.abs(this.velocity) < 0.0001 && Math.abs(displacement) < 0.0001) {
      this.value = this.goal;
      this.velocity = 0;
    }

    return this.value;
  }
}
