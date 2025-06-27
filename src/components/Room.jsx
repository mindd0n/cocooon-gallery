import React, { useRef, useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useThree, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer, Outline } from '@react-three/postprocessing';
import './styles.css';
import { useButtonImageData } from '../hooks/useButtonImageData';
import ContentDisplay from './ContentDisplay.jsx';
import InteractiveGoButton from './InteractiveGoButton.jsx';
import gsap from 'gsap';

// S3 기본 URL
const S3_BASE_URL = 'https://rest-exhibition.s3.ap-northeast-2.amazonaws.com/deploy_media';

// S3 리소스 로딩 최적화를 위한 설정
const S3_CONFIG = {
  baseUrl: S3_BASE_URL,
  retryAttempts: 3,
  retryDelay: 1000,
  timeout: 30000, // 30초 타임아웃
};

// 로컬 경로를 S3 경로로 변환하는 함수
const convertToS3Path = (localPath) => {
  if (localPath.startsWith('http')) {
    return localPath; // 이미 URL인 경우 그대로 반환
  }
  
  // 로컬 경로에서 파일명 추출
  const fileName = localPath.split('/').pop();
  return `${S3_BASE_URL}/${fileName}`;
};

// S3 리소스 로딩 재시도 함수
const loadS3Resource = async (url, retries = S3_CONFIG.retryAttempts) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        timeout: S3_CONFIG.timeout,
      });
      
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.warn(`S3 리소스 로딩 실패 (시도 ${i + 1}/${retries}):`, url, error);
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, S3_CONFIG.retryDelay * (i + 1)));
      }
    }
  }
  
  throw new Error(`S3 리소스 로딩 실패: ${url}`);
};

// 버튼 위치 계산 함수 (예시)
function getButtonPosition(wallType, buttonKey, index, total) {
  const gap = 20;
  
  // 기존 벽면들은 현재 방식 유지
  const baseY = 0;
  const baseZ = 0.1;
  return [index * gap - (total - 1) * gap / 2, baseY, baseZ];
}

// Room dimensions
const roomHeight = 150;
const roomWidth = 166.68; // 150 * 10 / 9
const roomDepth = 166.68;
const viewerHeight = 45;

const minDistance = 0.5;
const maxDistance = Math.max(roomWidth, roomHeight, roomDepth) / 2; // 큐브 밖으로 나가지 않도록 최대 거리 설정

// 초기 카메라 상태를 상수로 정의
const INITIAL_CAMERA_POSITION = new THREE.Vector3(0, viewerHeight, roomDepth / 2 - 1);
const INITIAL_CAMERA_LOOKAT = new THREE.Vector3(0, 0, 0);
const INITIAL_CAMERA_FOV = 75;

// 벽 텍스처 경로를 객체로 관리 (로컬 경로로 임시 변경)
const wallTexturePaths = {
  front: '/images/walls/wall_photo.png',
  back: '/images/walls/wall_walk.png',
  left: '/images/walls/wall_bus-stop.png',
  right: '/images/walls/wall_home.png',
  ceiling: '/images/walls/wall_ceiling.png',
  floor: '/images/walls/wall_floor.png',
};

// 버튼 centroid 픽셀 좌표 (이미지 크기: 2000x1800)
const buttonCentroids = {
  sun:    { x: 424.06,  y: 588.15 },
  path:   { x: 1069.95, y: 1367.17 },
  sign:   { x: 1813.97, y: 945.93 },
  bridge: { x: 416.34,  y: 1056.21 },
};

// 버튼 bounding box 위치 및 크기 (픽셀)
const buttonBBoxes = {
  sun:    { min_x: 0,    min_y: 268,  width: 895,  height: 589 },
  path:   { min_x: 0,    min_y: 419,  width: 1827, height: 1381 },
  sign:   { min_x: 1580, min_y: 619,  width: 420,  height: 818 },
  bridge: { min_x: 0,    min_y: 857,  width: 964,  height: 443 },
};

// 벽별 normal 벡터 정의
const wallNormals = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};

// 3D 중심 좌표 변환 함수
function bboxCenterTo3D({min_x, min_y, width, height}) {
  const center_x = min_x + width / 2;
  const center_y = min_y + height / 2;
  const left = center_x / 2000;
  const top = center_y / 1800;
  const posX = (left - 0.5) * roomWidth;
  const posY = (0.5 - top) * roomHeight;
  return [posX, posY];
}

// 3D 크기 변환 함수 (벽/천장/바닥별로 plane 크기 맞춤)
function bboxTo3DByWall({width, height}, wallType) {
  // 모든 벽은 기존과 동일
  return [width / 2000 * roomWidth, height / 1800 * roomHeight];
}

// UV repeat/offset 계산 함수
function getUVTransform({min_x, min_y, width, height}) {
  const repeatX = width / 2000;
  const repeatY = height / 1800;
  const offsetX = min_x / 2000;
  const offsetY = 1 - (min_y + height) / 1800;
  return { repeat: [repeatX, repeatY], offset: [offsetX, offsetY] };
}

// 카메라가 1번 레이어도 렌더링하도록 설정
function EnableLayer1OnCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.layers.enable(1);
  }, [camera]);
  return null;
}

// Glow Ring ShaderMaterial 생성 함수 (useRef + useFrame)
function useGlowRingMaterial() {
  const materialRef = useRef();
  useFrame(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.opacity.value = 0.7;
    }
  });
  if (!materialRef.current) {
    materialRef.current = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x00ff00) },
        radius: { value: 0.35 },
        width: { value: 0.3 },
        opacity: { value: 1 }
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float radius;
        uniform float width;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          float dist = distance(vUv, vec2(0.5, 0.5));
          float edge0 = radius;
          float edge1 = radius + width;
          float glow = smoothstep(edge1, edge0, dist);
          gl_FragColor = vec4(color, glow * opacity);
        }
      `
    });
  }
  return materialRef.current;
}

// 알파마스크 기반 Glow ShaderMaterial 생성 함수
function useAlphaGlowMaterial(texture) {
  return useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      color: { value: new THREE.Color(0x00ff00) },
      opacity: { value: 1 }
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float a = texture2D(map, vUv).a;
        float edge = smoothstep(0.45, 0.55, a); // 알파 경계에서만 빛나게
        gl_FragColor = vec4(color, edge * opacity);
      }
    `
  }), [texture]);
}

// Button 컴포넌트 수정
const Button = React.memo(function Button({ 
  type, 
  position, 
  src, 
  wallType, 
  hoveredObject, 
  setHoveredObject, 
  buttonKey, 
  hoverSrc, 
  controlsRef,
  setSelectedButton,
  animateCamera,
  btnIdx,
  btnTotal
}) {
  const isHovered = hoveredObject === buttonKey;
  const [size, texture, image, canvas, ready] = useButtonImageData(isHovered ? hoverSrc : src, wallType);
  const z = position && position[2] !== undefined ? position[2] : 0.1;
  const meshRef = useRef();
  
  const handleClick = useCallback((e) => {
    // 모든 벽면 버튼 클릭 시 로그
    console.log(`벽면 버튼 클릭: ${buttonKey}`);
    const pos = Array.isArray(position) ? position : [0, 0];
    if (!image || !texture || !canvas) return;
    const uv = e.uv;
    if (!uv) return;
    const x = Math.floor(uv.x * image.naturalWidth);
    const y = Math.floor((1 - uv.y) * image.naturalHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const alpha = ctx.getImageData(x, y, 1, 1).data[3] / 255;
    if (alpha > 0.05) {
      e.stopPropagation();
      const zoomTarget = getZoomTargetForButton(pos, wallType);
      animateCamera(
        {
          position: zoomTarget.position,
          target: zoomTarget.target,
          fov: 45
        },
        1.5,
        () => setSelectedButton(buttonKey)
      );
      setHoveredObject(null);
    }
  }, [position, image, texture, canvas, buttonKey, wallType, animateCamera, setHoveredObject, setSelectedButton]);

  const handlePointerMove = useCallback((e) => {
    const pos = Array.isArray(position) ? position : [0, 0];
    if (!image || !texture || !canvas) return;
    const uv = e.uv;
    if (!uv) return;
    const x = Math.floor(uv.x * image.naturalWidth);
    const y = Math.floor((1 - uv.y) * image.naturalHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const alpha = ctx.getImageData(x, y, 1, 1).data[3] / 255;
    if (alpha > 0.05 && hoveredObject !== buttonKey) {
      e.stopPropagation(); // 그림 부분만 stopPropagation
      setHoveredObject(buttonKey);
    } else if (alpha <= 0.05 && hoveredObject === buttonKey) {
      setHoveredObject(null);
    }
  }, [position, image, texture, canvas, hoveredObject, buttonKey, setHoveredObject]);

  const handlePointerOut = useCallback(() => {
    if (hoveredObject === buttonKey) {
      setHoveredObject(null);
    }
  }, [hoveredObject, buttonKey, setHoveredObject]);

  if (!ready) return null;

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[0, 0, 0]}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      <planeGeometry args={size} />
      <meshStandardMaterial
        {...(texture ? { map: texture } : { color: "#cccccc" })}
        transparent
        alphaTest={0.5}
        depthWrite={true}
      />
    </mesh>
  );
});

// 각 벽별 버튼 파일명 명시적으로 관리
const wallButtonFiles = {
  front: [
    'btn_p_go.png', 'btn_p_tree.png', 'btn_p_note.png', 'btn_p_pavilion.png'
  ],
  right: [
    'btn_h_home.png', 'btn_h_star.png', 'btn_h_dog.png', 'btn_h_ribbon.png'
  ],
  back: [
    'btn_w_bridge.png', 'btn_w_sign.png', 'btn_w_sun.png', 'btn_w_walk.png'
  ],
  left: [
    'btn_b_busstop.png', 'btn_b_bus.png', 'btn_b_home.png'
  ]
};
const wallButtonFolders = {
  front: 'wall_photo_btn',
  right: 'wall_home_btn',
  back: 'wall_walk_btn',
  left: 'wall_bus-stop_btn',
};

// getZoomTargetForButton 함수를 일반 함수로 변경
const getZoomTargetForButton = (position, wallType) => {
  const [x, y, z] = position;
  const distance = minDistance; // 더욱 강한 줌인
  let cameraPos, target;
  target = new THREE.Vector3(x, y, z);
  switch (wallType) {
    case 'front': cameraPos = new THREE.Vector3(x, y, z + distance); break;
    case 'back': cameraPos = new THREE.Vector3(x, y, z - distance); break;
    case 'left': cameraPos = new THREE.Vector3(x + distance, y, z); break;
    case 'right': cameraPos = new THREE.Vector3(x - distance, y, z); break;
    case 'ceiling': cameraPos = new THREE.Vector3(x, y - distance, z); break;
    case 'floor': cameraPos = new THREE.Vector3(x, y + distance, z); break;
    default: cameraPos = new THREE.Vector3(x, y, z + distance);
  }
  return { position: cameraPos, target };
};

// Room 컴포넌트를 별도로 분리
const Room = ({ 
  isHovered, 
  setIsHovered, 
  buttonRef, 
  setHoveredObject, 
  hoveredObject, 
  setSelectedButton,
  animateCamera
}) => {
  // 로컬 이미지는 crossOrigin 설정 제거
  const frontTex = useLoader(THREE.TextureLoader, wallTexturePaths.front);
  const backTex = useLoader(THREE.TextureLoader, wallTexturePaths.back);
  const leftTex = useLoader(THREE.TextureLoader, wallTexturePaths.left);
  const rightTex = useLoader(THREE.TextureLoader, wallTexturePaths.right);
  const ceilingTex = useLoader(THREE.TextureLoader, wallTexturePaths.ceiling);
  const floorTex = useLoader(THREE.TextureLoader, wallTexturePaths.floor);
  
  const wallTextures = {
    front: frontTex,
    back: backTex,
    left: leftTex,
    right: rightTex,
    ceiling: ceilingTex,
    floor: floorTex,
  };
  
  // 텍스처 상태 디버깅
  useEffect(() => {
    console.log('=== 텍스처 상태 확인 ===');
    console.log('frontTex:', frontTex, 'isTexture:', frontTex?.isTexture, 'image:', frontTex?.image);
    console.log('backTex:', backTex, 'isTexture:', backTex?.isTexture, 'image:', backTex?.image);
    console.log('leftTex:', leftTex, 'isTexture:', leftTex?.isTexture, 'image:', leftTex?.image);
    console.log('rightTex:', rightTex, 'isTexture:', rightTex?.isTexture, 'image:', rightTex?.image);
    console.log('ceilingTex:', ceilingTex, 'isTexture:', ceilingTex?.isTexture, 'image:', ceilingTex?.image);
    console.log('floorTex:', floorTex, 'isTexture:', floorTex?.isTexture, 'image:', floorTex?.image);
    
    // 텍스처가 로딩되면 이미지 정보도 출력
    if (frontTex?.image) {
      console.log('front 텍스처 이미지 로딩 완료:', frontTex.image.src);
    }
  }, [frontTex, backTex, leftTex, rightTex, ceilingTex, floorTex]);

  // wallButtonData를 컴포넌트 내부로 이동
  const wallButtonData = {
    'front': [
      { key: 'btn_p_go',       src: `${S3_BASE_URL}/btn_p_go.png`,       hoverSrc: `${S3_BASE_URL}/btn_p_go_hover.png` },
      { key: 'btn_p_tree',     src: `${S3_BASE_URL}/btn_p_tree.png`,     hoverSrc: `${S3_BASE_URL}/btn_p_tree_hover.png` },
      { key: 'btn_p_note',     src: `${S3_BASE_URL}/btn_p_note.png`,     hoverSrc: `${S3_BASE_URL}/btn_p_note_hover.png` },
      { key: 'btn_p_pavilion', src: `${S3_BASE_URL}/btn_p_pavilion.png`, hoverSrc: `${S3_BASE_URL}/btn_p_pavilion_hover.png` }
    ],
    'back': [
      { key: 'btn_w_bridge', src: `${S3_BASE_URL}/btn_w_bridge.png`, hoverSrc: `${S3_BASE_URL}/btn_w_bridge_hover.png` },
      { key: 'btn_w_walk',   src: `${S3_BASE_URL}/btn_w_walk.png`,   hoverSrc: `${S3_BASE_URL}/btn_w_walk_hover.png` },
      { key: 'btn_w_sun',    src: `${S3_BASE_URL}/btn_w_sun.png`,    hoverSrc: `${S3_BASE_URL}/btn_w_sun_hover.png` },
      { key: 'btn_w_sign',   src: `${S3_BASE_URL}/btn_w_sign.png`,   hoverSrc: `${S3_BASE_URL}/btn_w_sign_hover.png` },
    ],
    'left': [
      { key: 'btn_b_busstop', src: `${S3_BASE_URL}/btn_b_busstop.png`, hoverSrc: `${S3_BASE_URL}/btn_b_busstop_hover.png` },
      { key: 'btn_b_bus',     src: `${S3_BASE_URL}/btn_b_bus.png`,     hoverSrc: `${S3_BASE_URL}/btn_b_bus_hover.png` },
      { key: 'btn_b_home',    src: `${S3_BASE_URL}/btn_b_home.png`,    hoverSrc: `${S3_BASE_URL}/btn_b_home_hover.png` },
    ],
    'right': [
      { key: 'btn_h_dog',    src: `${S3_BASE_URL}/btn_h_dog.png`,    hoverSrc: `${S3_BASE_URL}/btn_h_dog_hover.png` },
      { key: 'btn_h_ribbon', src: `${S3_BASE_URL}/btn_h_ribbon.png`, hoverSrc: `${S3_BASE_URL}/btn_h_ribbon_hover.png` },
      { key: 'btn_h_star',   src: `${S3_BASE_URL}/btn_h_star.png`,   hoverSrc: `${S3_BASE_URL}/btn_h_star_hover.png` },
      { key: 'btn_h_home',   src: `${S3_BASE_URL}/btn_h_home.png`,   hoverSrc: `${S3_BASE_URL}/btn_h_home_hover.png` },
    ],
    'ceiling': [
      { key: 'btn_c_lamp',   src: `${S3_BASE_URL}/btn_c_lamp.png`,   hoverSrc: `${S3_BASE_URL}/btn_c_lamp_hover.png` },
      { key: 'btn_c_heart',  src: `${S3_BASE_URL}/btn_c_heart.png`,  hoverSrc: `${S3_BASE_URL}/btn_c_heart_hover.png` },
    ],
    'floor': [
      { key: 'btn_f_rug',    src: `${S3_BASE_URL}/btn_f_rug.png`,    hoverSrc: `${S3_BASE_URL}/btn_f_rug_hover.png` },
      { key: 'btn_f_phone',  src: `${S3_BASE_URL}/btn_f_phone.png`,  hoverSrc: `${S3_BASE_URL}/btn_f_phone_hover.png` },
    ],
  };

  const buttons = useMemo(() => {
    return Object.entries(wallButtonData).flatMap(([wallType, wallButtons]) => 
      wallButtons.map((btn, index) => {
        const position = getButtonPosition(wallType, btn.key, index, wallButtons.length);
        return { ...btn, wallType, position, btnIdx: index, btnTotal: wallButtons.length };
      })
    );
  }, []);

  return (
    <>
      {/* 조명 추가 */}
      <ambientLight intensity={2.0} color="#ffffff" />
      <directionalLight position={[0, 100, 0]} intensity={1.5} />
      <directionalLight position={[0, -100, 0]} intensity={0.5} />
      <directionalLight position={[100, 0, 0]} intensity={0.8} />
      <directionalLight position={[-100, 0, 0]} intensity={0.8} />
      {/* 벽과 기본 구조 */}
      <group ref={buttonRef}>
        {/* 벽들 */}
        {[
          { pos: [0, 0, -roomDepth / 2], rot: [0, 0, 0], tex: frontTex, type: 'front' },
          { pos: [0, 0, roomDepth / 2], rot: [0, Math.PI, 0], tex: backTex, type: 'back' },
          { pos: [-roomWidth / 2, 0, 0], rot: [0, Math.PI / 2, 0], tex: leftTex, type: 'left' },
          { pos: [roomWidth / 2, 0, 0], rot: [0, -Math.PI / 2, 0], tex: rightTex, type: 'right' },
          { pos: [0, roomHeight / 2, 0], rot: [Math.PI / 2, 0, 0], tex: ceilingTex, type: 'ceiling' },
          { pos: [0, -roomHeight / 2, 0], rot: [-Math.PI / 2, 0, 0], tex: floorTex, type: 'floor' },
        ].map((wall, i) => (
          <group key={i} position={wall.pos} rotation={wall.rot}>
            <mesh>
              <planeGeometry args={wall.type === 'ceiling' || wall.type === 'floor' ? [roomWidth, roomDepth] : [roomWidth, roomHeight]} />
              <meshStandardMaterial 
                map={wall.tex}
                color={wall.tex ? undefined : (wall.type === 'front' ? '#ff0000' : wall.type === 'back' ? '#00ff00' : wall.type === 'left' ? '#0000ff' : wall.type === 'right' ? '#ffff00' : wall.type === 'ceiling' ? '#ff00ff' : '#00ffff')}
                roughness={0.7}
                metalness={0.12}
                side={THREE.FrontSide}
              />
            </mesh>
            {/* 벽 중앙에 버튼 추가 - 천장과 바닥도 포함 */}
            {wallButtonData[wall.type]?.map((btn, idx) => {
              let z;
              let pos = [0, 0, 0];
              
              // 천장 버튼 위치 조정
              if (wall.type === 'ceiling') {
                z = -0.1 - idx * 0.05; // 천장은 아래쪽으로 더 멀리, 인덱스별로 간격
                pos = [0, 0, z];
              }
              // 바닥 버튼 위치 조정  
              else if (wall.type === 'floor') {
                z = 0.1 + idx * 0.05; // 바닥은 위쪽으로 더 멀리, 인덱스별로 간격
                pos = [0, 0, z]; // 중앙에 그대로 배치
              }
              // 기존 벽 버튼들
              else if (wall.type === 'front' && btn.src.includes('btn_p_tree')) {
                z = -0.05;
              } else if (wall.type === 'back' && btn.key === 'btn_w_sign') {
                z = 0.15; // Back 벽은 180도 회전되어 있어서 큰 숫자가 앞으로
              } else if (wall.type === 'back' && btn.key === 'btn_w_bridge') {
                z = 0.10; // 두 번째
              } else if (wall.type === 'back' && btn.key === 'btn_w_sun') {
                z = 0.05; // 세 번째
              } else if (wall.type === 'back' && btn.key === 'btn_w_walk') {
                z = 0.01; // 가장 뒤로
              } else if (wall.type === 'right' && btn.key === 'btn_h_home') {
                z = 0.01; // btn_h_home은 가장 뒤로
              } else {
                let baseZ = 0.01;
                if (wall.type === 'front' && btn.src.includes('btn_p_go')) baseZ = 0.02;
                if (wall.type === 'right' && btn.key === 'btn_h_home') {
                  z = 0.01; // btn_h_home은 가장 뒤로
                } else {
                  z = baseZ + idx * 0.01;
                }
                pos = [0, 0, z];
              }
              
              return (
                <Button
                  key={btn.key}
                  type={`${wall.type}_btn_${idx}`}
                  buttonKey={btn.key}
                  position={pos}
                  src={btn.src}
                  hoverSrc={btn.src.replace(/\.png$/, '_hover.png')}
                  wallType={wall.type}
                  setHoveredObject={setHoveredObject}
                  hoveredObject={hoveredObject}
                  controlsRef={buttonRef}
                  setSelectedButton={setSelectedButton}
                  animateCamera={animateCamera}
                />
              );
            })}
          </group>
        ))}
      </group>
    </>
  );
};

export default function RoomScene({ onLoadingProgress, onLoadingComplete }) {
  const [isHovered, setIsHovered] = useState(false);
  const buttonRef = useRef();
  const [outlineReady, setOutlineReady] = useState(false);
  const [cursor, setCursor] = useState(`url(${S3_BASE_URL}/cursor.png) 16 44, auto`);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [selectedButton, setSelectedButton] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const controlsRef = useRef();
  const [restoreView, setRestoreView] = useState(null);
  const [texturesLoaded, setTexturesLoaded] = useState(false);

  // 텍스처 로딩 상태 추적
  useEffect(() => {
    if (onLoadingProgress) {
      // 간단한 로딩 시뮬레이션 (실제로는 텍스처 로딩 상태를 추적해야 함)
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setTexturesLoaded(true);
          if (onLoadingComplete) onLoadingComplete();
        }
        if (onLoadingProgress) onLoadingProgress(progress);
      }, 300);
      
      return () => clearInterval(interval);
    }
  }, [onLoadingProgress, onLoadingComplete]);

  // OrbitControls 기반 카메라 애니메이션
  const animateCamera = useCallback((to, duration = 1.5, onComplete) => {
    setIsAnimating(true);
    gsap.to(controlsRef.current.object.position, {
      x: to.position.x,
      y: to.position.y,
      z: to.position.z,
      duration,
      ease: "power2.inOut"
    });
    gsap.to(controlsRef.current.target, {
      x: to.target.x,
      y: to.target.y,
      z: to.target.z,
      duration,
      ease: "power2.inOut",
      onUpdate: () => {
        controlsRef.current.update();
      },
      onComplete: () => {
        setIsAnimating(false);
        if (onComplete) onComplete();
      }
    });
  }, []);

  // 버튼 클릭 시 현재 카메라 위치/target 저장 (클릭 직전에 저장!)
  const handleButtonClick = useCallback((position, wallType, buttonKey) => {
    if (selectedButton) return; // 이미 팝업이 열려 있으면 무시
    // 버튼 클릭 직전 시점 저장
    setRestoreView({
      position: controlsRef.current.object.position.clone(),
      target: controlsRef.current.target.clone()
    });
    const zoomTarget = getZoomTargetForButton(position, wallType);
    animateCamera(
      {
        position: zoomTarget.position,
        target: zoomTarget.target
      },
      1.5,
      () => setSelectedButton(buttonKey)
    );
  }, [animateCamera, selectedButton]);

  // 복귀 시 항상 restoreView로 animateCamera, 복귀 후 restoreView는 null로 초기화
  const handleRestore = useCallback(() => {
    if (!selectedButton) return;
    const view = restoreView || {
      position: controlsRef.current.object.position.clone(),
      target: controlsRef.current.target.clone()
    };

    // restoreView의 target 방향으로 maxDistance만큼 떨어진 위치 계산
    const dir = new THREE.Vector3()
      .subVectors(view.position, view.target)
      .normalize();
    const zoomedOutPos = view.target.clone().add(dir.multiplyScalar(roomDepth / 2 - 1)); // maxDistance

    animateCamera(
      {
        position: zoomedOutPos,
        target: view.target.clone()
      },
      1.5,
      () => {
        setSelectedButton(null);
        setRestoreView(null);
      }
    );
  }, [selectedButton, restoreView, animateCamera]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleRestore();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRestore]);

  const handleOverlayClick = handleRestore;

  useEffect(() => {
    if (isHovered && buttonRef.current && buttonRef.current.parent) {
      setOutlineReady(true);
    } else {
      setOutlineReady(false);
    }
  }, [isHovered]);

  // 텍스처가 로딩되지 않았으면 아무것도 렌더링하지 않음
  // if (!texturesLoaded) {
  //   return null;
  // }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          cursor: isHovered ? `url(${S3_BASE_URL}/cursor-click.png) 16 44, auto` : `url(${S3_BASE_URL}/cursor.png) 16 44, auto`,
          position: 'relative',
          zIndex: 1,
          pointerEvents: selectedButton ? 'none' : 'auto',
        }}
      >
        <Canvas
          gl={{
            antialias: true,
            powerPreference: 'high-performance'
          }}
        camera={{ 
            position: INITIAL_CAMERA_POSITION,
            fov: INITIAL_CAMERA_FOV,
          }}
          onCreated={({ camera }) => {
            camera.lookAt(INITIAL_CAMERA_LOOKAT);
            camera.layers.enable(1);
          }}
        >
          <OrbitControls
            ref={controlsRef}
            enableZoom={!isAnimating}
            enablePan={!isAnimating}
            enableRotate={!isAnimating}
            minDistance={minDistance}
            maxDistance={maxDistance}
            target={INITIAL_CAMERA_LOOKAT}
          />
          <Suspense fallback={null}>
            <Room
              isHovered={isHovered}
              setIsHovered={setIsHovered}
              buttonRef={buttonRef}
              setHoveredObject={setHoveredObject}
              hoveredObject={hoveredObject}
              setSelectedButton={setSelectedButton}
              animateCamera={animateCamera}
            />
          </Suspense>
          <EffectComposer>
            <Outline
              selection={hoveredObject && buttonRef.current ? [buttonRef.current.getObjectByName(hoveredObject)].filter(Boolean) : []}
              edgeStrength={100}
              visibleEdgeColor={0x00ff00}
              hiddenEdgeColor={0x00ff00}
              blur
            />
          </EffectComposer>
        </Canvas>
      </div>

      {selectedButton && (
        <ContentDisplay 
          buttonId={selectedButton}
          onClose={handleRestore}
        />
      )}
    </div>
  );
}