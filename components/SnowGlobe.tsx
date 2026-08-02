import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Stars, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { GlobeData, WeatherCondition } from '../types';
import { WeatherParticles } from './WeatherParticles';

interface SnowGlobeProps {
  data: GlobeData | null;
  shakeIntensity: number;
}

// Procedural Window Texture
const useBuildingTexture = () => {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#ffffff'; 
        ctx.fillRect(0,0,64,64);
        ctx.fillStyle = '#999999'; // Windows
        // 2x2 window pattern per tile
        const pad = 8;
        const w = 20;
        ctx.fillRect(pad, pad, w, w);
        ctx.fillRect(36, pad, w, w);
        ctx.fillRect(pad, 36, w, w);
        ctx.fillRect(36, 36, w, w);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);
};

// Deterministic tree generator helper
const getTreesForCell = (cellX: number, cellZ: number, worldX: number, worldZ: number) => {
    const trees = [];
    // Deterministic pseudo-random based on coords
    const hash = Math.abs(Math.sin(cellX * 12.9898 + cellZ * 78.233) * 43758.5453);
    const count = Math.floor((hash % 1) * 2) + 1; // 1 or 2 trees
    
    for(let i=0; i<count; i++) {
        const h2 = Math.abs(Math.sin((cellX+i*10) * 12.9898 + (cellZ+i*10) * 78.233) * 43758.5453);
        const offsetX = ((h2 % 1) - 0.5) * 0.5;
        const offsetZ = (((h2 * 10) % 1) - 0.5) * 0.5;
        const scale = 0.6 + ((h2 * 100) % 1) * 0.4; // 0.6 to 1.0 scale
        trees.push({
            x: worldX + offsetX,
            z: worldZ + offsetZ,
            scale,
        });
    }
    return trees;
};

const SnowSystem: React.FC<{ data: GlobeData; shakeIntensity: number }> = ({ data, shakeIntensity }) => {
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const groundRef = useRef<THREE.InstancedMesh>(null);
  const treeSnowRef = useRef<THREE.InstancedMesh>(null);
  
  const snowDepth = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const gridOffset = -6;

  // Precompute positions
  const { roofs, grounds, treeTops } = useMemo(() => {
    const r: any[] = [];
    const g: any[] = [];
    const t: any[] = [];

    data.layout.forEach((cell) => {
      const wx = cell.x + gridOffset;
      const wz = cell.z + gridOffset;

      if (cell.type === 'building' && cell.height > 0) {
        // Snow on roof
        const height = cell.height * 0.6;
        r.push({ x: wx, y: height, z: wz, width: 0.9, depth: 0.9 });
      } else if (cell.type === 'park') {
          // Snow on ground
          g.push({ x: wx, y: -0.05, z: wz, width: 0.95, depth: 0.95 });
          // Snow on trees
          const trees = getTreesForCell(cell.x, cell.z, wx, wz);
          trees.forEach(tree => {
              // Tree top height approx: 0.8 * scale.
              t.push({ x: tree.x, y: 0.75 * tree.scale, z: tree.z, scale: tree.scale });
          });
      } else if (cell.type === 'road') {
          // Roads accumulate less/slower usually, but for simplicity treated as ground
          g.push({ x: wx, y: -0.05, z: wz, width: 0.95, depth: 0.95 });
      }
    });
    return { roofs: r, grounds: g, treeTops: t };
  }, [data.layout]);

  useFrame((state, delta) => {
    const isSnowing = data.weather.condition === WeatherCondition.Snow;
    const isRaining = data.weather.condition === WeatherCondition.Rain;
    
    // Build up or Melt
    let targetChange = 0;
    if (isSnowing) {
        targetChange = 0.05 * (1 + data.weather.precipitationIntensity + shakeIntensity * 5) * delta;
    } else {
        let meltRate = 0.03;
        if (isRaining) meltRate = 0.2;
        if (data.weather.temperature > 5) meltRate = 0.1;
        targetChange = -meltRate * delta;
    }

    snowDepth.current = THREE.MathUtils.clamp(snowDepth.current + targetChange, 0, 0.45);
    const depth = snowDepth.current;
    const visible = depth > 0.01;

    // Roofs
    if (roofRef.current) {
        roofRef.current.visible = visible;
        if(visible) {
            roofs.forEach((pos, i) => {
                dummy.position.set(pos.x, pos.y + depth/2, pos.z);
                dummy.rotation.set(0,0,0);
                dummy.scale.set(pos.width, depth, pos.depth);
                dummy.updateMatrix();
                roofRef.current!.setMatrixAt(i, dummy.matrix);
            });
            roofRef.current.instanceMatrix.needsUpdate = true;
        }
    }

    // Ground
    if (groundRef.current) {
        groundRef.current.visible = visible;
        if(visible) {
            grounds.forEach((pos, i) => {
                dummy.position.set(pos.x, pos.y + depth/2, pos.z);
                dummy.rotation.set(0,0,0);
                dummy.scale.set(pos.width, depth, pos.depth);
                dummy.updateMatrix();
                groundRef.current!.setMatrixAt(i, dummy.matrix);
            });
            groundRef.current.instanceMatrix.needsUpdate = true;
        }
    }

    // Trees
    if (treeSnowRef.current) {
        treeSnowRef.current.visible = visible;
        if(visible) {
            treeTops.forEach((pos, i) => {
                dummy.position.set(pos.x, pos.y + depth * 0.2, pos.z); // Rise slightly with depth
                dummy.rotation.set(0,0,0);
                // Scale snow cap based on depth
                const s = pos.scale * Math.min(depth * 3, 0.6); 
                dummy.scale.set(s, s * 0.8, s);
                dummy.updateMatrix();
                treeSnowRef.current!.setMatrixAt(i, dummy.matrix);
            });
            treeSnowRef.current.instanceMatrix.needsUpdate = true;
        }
    }
  });

  return (
    <group>
      <instancedMesh ref={roofRef} args={[undefined, undefined, roofs.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={groundRef} args={[undefined, undefined, grounds.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={treeSnowRef} args={[undefined, undefined, treeTops.length]}>
        <coneGeometry args={[0.5, 0.5, 7]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
    </group>
  );
};

const CityScene: React.FC<{ data: GlobeData }> = ({ data }) => {
  const { layout, theme } = data;
  const gridOffset = -6;
  const windowTex = useBuildingTexture();

  // Memoize geometry generation
  const instances = useMemo(() => {
    const meshes: React.ReactElement[] = [];
    
    layout.forEach((cell, i) => {
      const wx = cell.x + gridOffset;
      const wz = cell.z + gridOffset;

      // --- Ground / Base ---
      if (cell.type === 'water') {
         // Water surface
         meshes.push(
            <mesh key={`water-${i}`} position={[wx, -0.1, wz]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.95, 0.95]} />
              <meshStandardMaterial 
                 color="#3388cc" 
                 roughness={0.1} 
                 metalness={0.6} 
                 transparent 
                 opacity={0.85} 
              />
            </mesh>
         );
         // Dark bed below water for depth
         meshes.push(
             <mesh key={`waterbed-${i}`} position={[wx, -0.25, wz]} rotation={[-Math.PI / 2, 0, 0]}>
               <planeGeometry args={[0.98, 0.98]} />
               <meshStandardMaterial color="#0b1a26" roughness={1} />
             </mesh>
         );
      } else if (cell.type === 'road') {
         // Road (Recessed slightly)
         meshes.push(
           <mesh key={`road-${i}`} position={[wx, -0.04, wz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
             <planeGeometry args={[1, 1]} />
             <meshStandardMaterial color="#333333" roughness={0.9} />
           </mesh>
         );
      } else {
         // Park or Building Base (Sidewalk/Grass)
         const isPark = cell.type === 'park';
         meshes.push(
            <mesh key={`ground-${i}`} position={[wx, -0.05, wz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[0.98, 0.98]} />
              <meshStandardMaterial color={isPark ? '#3a5f2d' : theme.groundColor} roughness={1} />
            </mesh>
         );
         
         if (isPark) {
             const trees = getTreesForCell(cell.x, cell.z, wx, wz);
             trees.forEach((tree, idx) => {
                 // Trunk
                 meshes.push(
                     <mesh key={`trunk-${i}-${idx}`} position={[tree.x, 0.1 * tree.scale, tree.z]} castShadow receiveShadow>
                         <cylinderGeometry args={[0.04 * tree.scale, 0.06 * tree.scale, 0.25 * tree.scale, 5]} />
                         <meshStandardMaterial color="#4d3b2a" roughness={1} />
                     </mesh>
                 );
                 // Foliage
                 meshes.push(
                     <mesh key={`foliage-${i}-${idx}`} position={[tree.x, 0.4 * tree.scale, tree.z]} castShadow receiveShadow>
                         <coneGeometry args={[0.25 * tree.scale, 0.8 * tree.scale, 7]} />
                         <meshStandardMaterial color="#2d4c1e" roughness={0.8} />
                     </mesh>
                 );
             });
         }
      }

      // --- Buildings ---
      if (cell.type === 'building' && cell.height > 0) {
        const height = cell.height * 0.6;
        const y = height / 2;
        // Seeded color selection: deterministic per cell index so colors don't flicker on re-render
        const colorHash = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
        const color = theme.buildingColors[Math.floor(colorHash * theme.buildingColors.length)];
        
        meshes.push(
          <mesh key={`build-${i}`} position={[wx, y, wz]} castShadow receiveShadow>
            <boxGeometry args={[0.9, height, 0.9]} />
            <meshStandardMaterial 
                color={color} 
                roughness={0.4} 
                map={windowTex}
            />
          </mesh>
        );

        // Lit Windows at Night (Random emissive planes)
        if (!data.weather.isDay) {
            // Chance to have lights on
            // Seeded window light placement: deterministic per cell index
            const lightHash = Math.abs(Math.sin(i * 45.164 + 12.8745) * 43758.5453) % 1;
            if(lightHash > 0.3) {
                 // Add a plane slightly offset from the face
                 meshes.push(
                    <mesh key={`light-${i}`} position={[wx, y, wz + 0.455]}>
                        <planeGeometry args={[0.7, height * 0.8]} />
                        <meshStandardMaterial 
                            color="#ffcc66" 
                            emissive="#ffaa00" 
                            emissiveIntensity={1.5} 
                            transparent 
                            opacity={0.4} 
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                 );
            }
        }
      } 
    });
    return meshes;
  }, [layout, theme, data.weather.condition, data.weather.isDay, windowTex]);

  return <group>{instances}</group>;
};

export const SnowGlobe: React.FC<SnowGlobeProps> = ({ data, shakeIntensity }) => {
  if (!data) return null;

  return (
    <Canvas shadows camera={{ position: [12, 12, 12], fov: 45 }}>
      {/* Dynamic Lighting */}
      <ambientLight intensity={data.weather.isDay ? 0.6 : 0.15} />
      <pointLight 
        position={[10, 20, 10]} 
        intensity={data.weather.isDay ? 1 : 0.8} 
        castShadow 
        shadow-mapSize={[2048, 2048]} 
        shadow-bias={-0.0001}
      />
      {/* Rim light for night magic */}
      {!data.weather.isDay && <pointLight position={[-10, 5, -10]} intensity={0.5} color="#4466ff" />}
      
      {!data.weather.isDay && <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}
      {data.weather.isDay && <Sky sunPosition={[10, 10, 10]} turbidity={data.weather.condition === WeatherCondition.Clear ? 0.5 : 10} />}

      <group position={[0, -2, 0]}>
        {/* The Base */}
        <mesh position={[0, -1, 0]} receiveShadow>
          <cylinderGeometry args={[7.5, 8.5, 2, 64]} />
          <meshStandardMaterial color="#2a1a0a" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.5, 0]} receiveShadow>
           <cylinderGeometry args={[7.2, 7.2, 1.2, 64]} />
           <meshStandardMaterial color="#4a3015" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
             <cylinderGeometry args={[7, 7, 0.2, 64]} />
             <meshStandardMaterial color={data.theme.groundColor} />
        </mesh>

        {/* The Glass Dome */}
        <mesh position={[0, 5, 0]}>
          <sphereGeometry args={[7, 64, 64]} />
          <meshPhysicalMaterial 
            roughness={0} 
            thickness={1.5} 
            transmission={0.98} // Clearer Glass
            transparent
            opacity={0.3}
            color={data.theme.glassTint || "white"}
            clearcoat={1}
            clearcoatRoughness={0}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* The City Inside */}
        <group position={[0, 0, 0]}>
           <CityScene data={data} />
           {/* Dynamic Snow Accumulation System */}
           <SnowSystem key={data.locationName} data={data} shakeIntensity={shakeIntensity} />
        </group>

        {/* Weather System */}
        <WeatherParticles 
            weather={data.weather} 
            layout={data.layout} 
            shakeIntensity={shakeIntensity} 
        />
      </group>

      <ContactShadows opacity={0.6} scale={40} blur={2.5} far={10} resolution={512} color="#000000" />
      <OrbitControls 
        enablePan={false} 
        minPolarAngle={0} 
        maxPolarAngle={Math.PI / 2} 
        minDistance={12} 
        maxDistance={40} 
        autoRotate={shakeIntensity === 0}
        autoRotateSpeed={0.5}
      />
    </Canvas>
  );
};