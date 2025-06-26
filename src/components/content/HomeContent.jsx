import React, { useState, useEffect, useRef } from 'react';
import './HomeContent.css';

const HomeContent = () => {
  const [selectedContent, setSelectedContent] = useState(null);
  const [zIndexOrder, setZIndexOrder] = useState({
    icon_o: 2,
    icon_p: 3,
    icon_q: 4,
  });
  const imageDataRef = useRef({});
  const iconRefs = useRef({
    icon_o: null,
    icon_p: null,
    icon_q: null,
  });

  useEffect(() => {
    Object.entries(iconRefs.current).forEach(([id, ref]) => {
      if (ref) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = ref.src;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          imageDataRef.current[id] = ctx.getImageData(0, 0, img.width, img.height).data;
        };
      }
    });
  }, []);

  // iframe 메시지 이벤트 리스너 추가
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data === 'closeNewspaper') {
        setSelectedContent(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const isPixelTransparent = (x, y, iconId, element) => {
    const imageData = imageDataRef.current[iconId];
    if (!imageData || !element) {
      console.error(`[DEBUG] ${iconId}의 이미지 데이터나 DOM 요소를 찾을 수 없습니다.`);
      return true;
    }

    const rect = element.getBoundingClientRect();
    const localX = x - rect.left;
    const localY = y - rect.top;
    
    const realX = Math.round(localX * (element.naturalWidth / element.width));
    const realY = Math.round(localY * (element.naturalHeight / element.height));

    const alphaIndex = (realY * element.naturalWidth + realX) * 4 + 3;
    const alphaValue = imageData[alphaIndex];
    
    console.log(`[DEBUG] ${iconId} 클릭 위치의 Alpha 값: ${alphaValue}`);
    
    return !alphaValue || alphaValue < 10;
  };

  const handleWrapperClick = (e) => {
    const sortedIcons = Object.keys(iconRefs.current).sort((a, b) => zIndexOrder[b] - zIndexOrder[a]);

    for (const iconId of sortedIcons) {
      const iconElement = iconRefs.current[iconId];
      const rect = iconElement.getBoundingClientRect();

      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        if (!isPixelTransparent(e.clientX, e.clientY, iconId, iconElement)) {
          setSelectedContent(iconId);
          const maxZIndex = Math.max(...Object.values(zIndexOrder));
          setZIndexOrder(prev => ({ ...prev, [iconId]: maxZIndex + 1 }));
          return; // 첫 번째로 감지된 아이콘만 처리하고 종료
        }
      }
    }
  };

  const handleCloseDetail = () => setSelectedContent(null);

  const renderDetailContent = () => {
    if (!selectedContent) return null;

    switch (selectedContent) {
      case 'icon_o': return <video key="video_o" src="/deploy_videos/O.mp4" style={{ width: '100%', height: '100%', objectFit: 'contain' }} controls autoPlay loop playsInline />;
      case 'icon_p': return <iframe key="iframe_p" src="/content/btn_h_home/P.수면신문/dist/index.html" style={{ width: '100%', height: '100%', border: 'none', minHeight: '600px' }} title="수면신문" />;
      case 'icon_q': return <video key="video_q" src="/deploy_videos/Q.mp4" style={{ width: '100%', height: '100%', objectFit: 'contain' }} controls autoPlay loop playsInline />;
      default: return null;
    }
  };

  return (
    <div className="home-container" onClick={handleWrapperClick}>
      {/* 배경 이미지 */}
      <img 
        src="/content/btn_h_home/btn_h_home_bg.png" 
        alt="Home Background" 
        className="home-bg-image"
      />
      
      {/* 아이콘 버튼들 - 색이 있는 부분만 클릭 가능 */}
      <div className="icons-wrapper">
        <div className="icon-button icon-o" style={{ zIndex: zIndexOrder.icon_o }}>
          <img ref={iconRefs.icon_o} src="/content/btn_h_home/icon_o.png" alt="Icon O" className="icon-image" />
        </div>
        <div className="icon-button icon-p" style={{ zIndex: zIndexOrder.icon_p }}>
          <img ref={iconRefs.icon_p} src="/content/btn_h_home/icon_p.png" alt="Icon P" className="icon-image" />
        </div>
        <div className="icon-button icon-q" style={{ zIndex: zIndexOrder.icon_q }}>
          <img ref={iconRefs.icon_q} src="/content/btn_h_home/icon_q.png" alt="Icon Q" className="icon-image" />
        </div>
      </div>

      {/* 2차 팝업창 */}
      {selectedContent && (
        <div className="detail-popup-overlay" onClick={handleCloseDetail}>
          <div className={`detail-popup-content ${selectedContent === 'icon_p' ? 'large' : ''}`}>
            {renderDetailContent()}
            {selectedContent !== 'icon_p' && (
              <button onClick={handleCloseDetail} className="close-detail-button">X</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeContent; 