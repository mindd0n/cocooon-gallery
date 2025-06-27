import React, { useEffect, useState } from 'react';
import RoomScene from './components/Room';
import IntroScreen from './components/IntroScreen.jsx';
import LoadingScreen from './components/LoadingScreen';
import RightBottomControls from './components/RightBottomControls';

function App() {
  const [showIntro, setShowIntro] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage] = useState("텍스처 로딩 중...");

  // 커서 동적 변경은 body에만 적용
  useEffect(() => {
    const handlePointerDown = () => {
      document.body.style.cursor = "url('/images/cursor-click.png') 16 44, auto";
    };
    const handlePointerUp = () => {
      document.body.style.cursor = "url('/images/cursor.png') 16 44, auto";
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    document.body.style.cursor = "url('/images/cursor.png') 16 44, auto";
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleIntroComplete = () => {
    console.log('인트로 완료, 텍스처 로딩 시작');
    setShowLoading(true);
    setLoadingProgress(0);
  };

  const handleLoadingComplete = () => {
    console.log('텍스처 로딩 완료, 3D 룸으로 전환');
    setShowLoading(false);
  };

  const handleLoadingProgress = (progress) => {
    setLoadingProgress(progress);
  };

  if (showIntro) {
    return <IntroScreen onComplete={handleIntroComplete} />;
  }

  if (showLoading) {
    return <LoadingScreen progress={loadingProgress} message={loadingMessage} />;
  }

  return (
    <>
      <RoomScene 
        onLoadingProgress={handleLoadingProgress}
        onLoadingComplete={handleLoadingComplete}
      />
      <RightBottomControls />
    </>
  );
}

export default App;
