import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GridCell, WeatherCondition, WeatherParams } from '../types';

interface WeatherParticlesProps {
  weather: WeatherParams;
  layout: GridCell[];
  shakeIntensity: number;
}

const PARTICLE_COUNT = 3000;
const GRID_OFFSET = -6; // Center the 12x12 grid (0..11) around 0

export const WeatherParticles: React.FC<WeatherParticlesProps> = ({ weather, layout, shakeIntensity }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Physics state
  const particles = useMemo(() => {
    const data = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      data.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          Math.random() * 15 + 5,
          (Math.random() - 0.5) * 12
        ),
        velocity: new THREE.Vector3(0, 0, 0),
        active: false,
        life: 0,
        seed: Math.random()
      });
    }
    return data;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Height map for collision
  const heightMap = useMemo(() => {
    const map = new Map<string, number>();
    layout.forEach(cell => {
      // Convert grid coords to world coords
      // Grid 0..11 -> World -6..5
      const wx = cell.x + GRID_OFFSET;
      const wz = cell.z + GRID_OFFSET;
      // Store height. Each height unit is roughly 0.8 world units? Let's say 1 grid height = 0.6 world units
      map.set(`${wx},${wz}`, cell.height * 0.6); 
    });
    return map;
  }, [layout]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const { condition, windSpeed, precipitationIntensity } = weather;
    
    // Don't simulate if clear, unless shaking
    if (condition === WeatherCondition.Clear && shakeIntensity < 0.1) {
      meshRef.current.count = 0;
      return;
    }

    // Determine particle behavior based on weather
    let gravity = -5;
    let windX = (windSpeed / 10) + (Math.sin(state.clock.elapsedTime) * 2);
    let particleSize = 0.08;
    
    if (condition === WeatherCondition.Snow) {
      gravity = -1.5;
      particleSize = 0.12;
    } else if (condition === WeatherCondition.Rain) {
      gravity = -15;
      particleSize = 0.06;
      windX *= 0.2; // Rain falls straighter usually
    }

    // Shake effect
    if (shakeIntensity > 0) {
      gravity -= shakeIntensity * 10; // Pull down faster or chaotic
      windX += (Math.random() - 0.5) * shakeIntensity * 50;
    }

    let activeCount = 0;
    
    // Scale active particles based on intensity + shake
    const maxActive = Math.min(PARTICLE_COUNT, Math.floor(PARTICLE_COUNT * (precipitationIntensity + shakeIntensity)));

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];

      // Reset dead particles
      if (!p.active || p.position.y < -5 || Math.abs(p.position.x) > 8 || Math.abs(p.position.z) > 8) {
        if (activeCount < maxActive) {
           p.active = true;
           p.position.set(
             (Math.random() - 0.5) * 10,
             10 + Math.random() * 5, // Spawn high
             (Math.random() - 0.5) * 10
           );
           // Initial velocity
           p.velocity.set(
             windX * 0.5 + (Math.random() - 0.5), 
             gravity * 0.5, 
             (Math.random() - 0.5)
           );
           // Shake adds chaotic velocity
           if (shakeIntensity > 0.5) {
             p.velocity.add(new THREE.Vector3(
                (Math.random()-0.5) * 10,
                (Math.random()-0.5) * 10,
                (Math.random()-0.5) * 10
             ));
           }
        } else {
          p.active = false;
          // Move out of view
          dummy.position.set(0, -100, 0);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }
      }

      // Physics Update
      p.velocity.y += gravity * delta * 0.5; // Gravity acceleration
      p.velocity.x += (windX - p.velocity.x) * delta * 2; // Wind drag
      
      // Turbulence
      p.velocity.x += Math.sin(state.clock.elapsedTime * 5 + p.seed * 10) * 2 * delta;
      
      p.position.addScaledVector(p.velocity, delta);

      // Collision with Floor/Buildings
      const gridX = Math.round(p.position.x - GRID_OFFSET);
      const gridZ = Math.round(p.position.z - GRID_OFFSET);
      
      // Check collision
      let floorHeight = 0;
      // We snap to nearest integer coordinate to check height map
      // But we must convert back to world grid index
      // World X = GridX + Offset -> GridX = WorldX - Offset
      // Actually above logic: px = cell.x + offset. So cell.x = px - offset.
      // My logic above `const wx = cell.x + GRID_OFFSET` is correct.
      // So `gridX` approx equals `cell.x`
      
      // Map keys are world coordinates? No, I stored heightMap keys as `wx,wz`.
      const key = `${Math.round(p.position.x)},${Math.round(p.position.z)}`;
      if (heightMap.has(key)) {
         floorHeight = heightMap.get(key)!;
      }
      
      if (p.position.y <= floorHeight) {
         // Collision!
         p.active = false; // Kill particle
         
         // Accumulation Logic (only for snow)
         if (condition === WeatherCondition.Snow && Math.random() > 0.9) {
             // We can't update react state inside useFrame easily without lag.
             // Visual trick: stop the particle here for a while?
             // Or better: In a real app we'd use a texture or shader for accumulation.
             // For this demo, we just let them disappear.
         }
      }

      // Update Instance
      if (p.active) {
        dummy.position.copy(p.position);
        
        // Rain is streaks, Snow is round
        if (condition === WeatherCondition.Rain) {
             dummy.scale.set(0.05, 0.4, 0.05);
             // Orient to velocity
             // Simple lookAt approximation or just tilt
             dummy.rotation.set(0,0, -Math.atan2(p.velocity.x, -p.velocity.y));
        } else {
             dummy.scale.setScalar(particleSize);
             dummy.rotation.set(0,0,0);
        }
        
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        activeCount++;
      }
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  const materialColor = weather.condition === WeatherCondition.Rain ? '#aaddff' : '#ffffff';
  
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      {weather.condition === WeatherCondition.Rain ? (
         <boxGeometry args={[1, 1, 1]} /> 
      ) : (
         <sphereGeometry args={[1, 6, 6]} />
      )}
      <meshBasicMaterial 
        color={materialColor} 
        transparent 
        opacity={weather.condition === WeatherCondition.Rain ? 0.6 : 0.9} 
      />
    </instancedMesh>
  );
};
