import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CameraPermissionProps {
  width?: number;
  height?: number;
  onStream: (stream: MediaStream, video: HTMLVideoElement) => void;
  onError?: (error: string) => void;
}

const CameraPermission: React.FC<CameraPermissionProps> = ({
  width = 640,
  height = 480,
  onStream,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'requesting' | 'granted' | 'denied' | 'error'>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const streamRef = useRef<MediaStream | null>(null);

  const requestCamera = useCallback(async () => {
    try {
      setStatus('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
          setStatus('granted');
          onStream(stream, videoRef.current!);
        };
      }
    } catch (err) {
      const msg = err instanceof DOMException
        ? err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access.'
          : err.name === 'NotFoundError'
            ? 'No camera found.'
            : `Camera error: ${err.message}`
        : 'Failed to access camera.';

      setStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
      setErrorMsg(msg);
      onError?.(msg);
    }
  }, [width, height, onStream, onError]);

  useEffect(() => {
    requestCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [requestCamera]);

  if (status === 'denied' || status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-gray-900 text-white p-4">
        <p className="text-sm text-red-400 mb-2">{errorMsg}</p>
        <button
          onClick={requestCamera}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        width={width}
        height={height}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      {status === 'requesting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <p className="text-xs text-gray-300">Requesting camera...</p>
        </div>
      )}
    </>
  );
};

export default CameraPermission;
