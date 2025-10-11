# README: The Aware Juggernaut

## Project Overview

This project contains the autonomous control code for a competitive LEGO EV3 Sumo Robot. The robot's core philosophy is that of an **"Aware Juggernaut"**—a design that leverages a known physical advantage in torque with an intelligent, adaptive, and positionally-aware combat doctrine.

Instead of being a simple reactive machine, this robot is designed to dominate the Dohyō by understanding its own strengths, mapping the arena in real-time, and actively forcing opponents into unwinnable situations.

## Key Tactical Systems

The robot's intelligence is built on several key interconnected systems:

### 1. The Juggernaut Doctrine & Torque Confidence
The robot knows it has **superior torque**. Its primary goal is to force the head-on engagements it is designed to win.

*   **Torque Confidence:** A dynamic variable that acts as the robot's self-esteem. It increases with every successful push and shatters when a push fails (stalls).
*   **Adaptive Strategy:** When confidence is high, it defaults to a dominant `STRAIGHT_PUSH`. If confidence is broken, it switches to more evasive `HOOK` maneuvers to regain the upper hand.

### 2. Passive Positional Awareness
The robot's greatest defensive strength is that it **never needs to stop to know where it is**.

*   **The Center Vector:** The robot continuously updates an internal "compass"—a gyro angle that points to the center of the ring.
*   **Passive Scanning:** Instead of risky, stationary scans, it builds its map of the arena *during its normal search turns*. By logging the floor color as it spins, it understands its position without ever becoming a vulnerable target.

### 3. Dynamic Stance System
The code is built around a fluid, two-stance architecture rather than a rigid set of states, allowing for seamless transitions between combat and searching.

*   **`SEARCHING` Stance:** Active when no enemy is confirmed. The robot safely maps the arena while methodically scanning for a target.
*   **`ENGAGED` Stance:** Active when an enemy is confirmed. The robot's entire logic shifts to combat, selecting the best attack and applying pressure to win the match.

### 4. The Pressure Vector
The robot doesn't just push forward; it pushes with purpose.

*   The **Pressure Vector** is calculated as the direct opposite of the Center Vector.
*   During a `STRAIGHT_PUSH`, the robot uses its gyro to subtly steer the opponent along this vector—the shortest and most efficient path to the edge of the Dohyō.

### 5. Time-Based Logic
The code uses the standard `Date.now()` function for all timing-related calculations. This provides precise, millisecond-accurate control over actions like stall detection, target confirmation, and match timers, ensuring the robot's reactions are both sharp and reliable.

## How It Works: A Match in the Life of the Juggernaut

1.  **Deduce Position (Start):** The match begins. The robot instantly checks for an opponent ahead. If none is found, it makes a *randomized* 90-degree peek to the left or right, making its opening move unpredictable.

2.  **Passive Scan (Searching):** Having found no target, it enters the `SEARCHING` stance and begins a continuous 360-degree turn. As it turns, it watches the floor, constantly updating its `centerVector` to know where the safe center is. It is simultaneously looking for the opponent.

3.  **Confirm and Engage:** The ultrasonic sensor spots the opponent. The robot's internal timer starts. If the opponent remains visible for a fraction of a second (confirming it's not a glitch), the robot's stance instantly shifts to `ENGAGED`.

4.  **Dominate:** Its **Torque Confidence** is high. It selects the `STRAIGHT_PUSH` strategy. It calculates the **Pressure Vector** and begins its intelligent "Bulldozer" push, actively steering the opponent toward the nearest edge.

5.  **Adapt and Overcome:**
    *   ***If the push succeeds:*** The opponent is ejected. The robot loses sight of them and reverts to the `SEARCHING` stance, ready for the next engagement.
    *   ***If the push fails (stalls):*** Its **Torque Confidence** is shattered. It executes a quick flanking maneuver, then re-enters the `SEARCHING` stance to re-evaluate. It will now favor `HOOK` attacks until its confidence is rebuilt.
    *   ***If pushed to the edge:*** It calculates the risk. If confident, it may attempt a high-risk `riposte` counter-attack. If not, it uses its `centerVector` knowledge to execute a perfect, safe escape back to the center of the ring.
