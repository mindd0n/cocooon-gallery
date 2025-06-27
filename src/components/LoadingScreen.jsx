import React from 'react';

const LoadingScreen = ({ progress, message }) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            zIndex: 9999
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: '400px',
                padding: '20px'
            }}>
                <h1 style={{
                    fontSize: '2.5rem',
                    marginBottom: '20px',
                    fontWeight: '300',
                    color: '#fff0e6'
                }}>
                    쉼
                </h1>
                
                <div style={{
                    width: '300px',
                    height: '4px',
                    backgroundColor: '#333',
                    borderRadius: '2px',
                    margin: '20px auto',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        backgroundColor: '#fff0e6',
                        transition: 'width 0.3s ease',
                        borderRadius: '2px'
                    }} />
                </div>
                
                <p style={{
                    fontSize: '1rem',
                    marginBottom: '10px',
                    color: '#ccc'
                }}>
                    {message || '리소스를 로딩하고 있습니다...'}
                </p>
                
                <p style={{
                    fontSize: '0.9rem',
                    color: '#888'
                }}>
                    {Math.round(progress)}%
                </p>
                
                <div style={{
                    marginTop: '30px',
                    fontSize: '0.8rem',
                    color: '#666'
                }}>
                    <p>대용량 미디어 파일을 다운로드 중입니다.</p>
                    <p>잠시만 기다려주세요...</p>
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen; 