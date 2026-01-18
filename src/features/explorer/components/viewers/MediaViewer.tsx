import React, { useState, useEffect, useRef } from 'react';
import { Download, AlertCircle, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { FileEntry } from '../../types';

interface MediaViewerProps {
  file: FileEntry;
  className?: string;
}

// ✅ Rileva se un formato video è supportato dal browser
function isFormatSupported(fileName: string, mimeType?: string): { supported: boolean; reason?: string } {
  const ext = fileName.toLowerCase().split('.').pop() || '';

  // Formati universalmente supportati
  if (['mp4', 'webm', 'ogg'].includes(ext)) {
    return { supported: true };
  }

  // Formati spesso non supportati nativamente
  if (['avi', 'mkv', 'mov', 'wmv', 'flv', 'm4v'].includes(ext)) {
    // Verifica supporto codec se possibile
    if (mimeType) {
      const video = document.createElement('video');
      const canPlay = video.canPlayType(mimeType);
      if (canPlay === 'probably' || canPlay === 'maybe') {
        return { supported: true };
      }
    }
    return {
      supported: false,
      reason: `Il formato ${ext.toUpperCase()} potrebbe non essere supportato dal browser. Il file originale è intatto e verificabile tramite hash SHA-256.`
    };
  }

  return { supported: true };
}

export function MediaViewer({ file, className = '' }: MediaViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formatNotSupported, setFormatNotSupported] = useState(false);
  const [formatReason, setFormatReason] = useState<string | undefined>(undefined);

  const mediaRef = React.useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const isVideo = file.kind === 'video';

  // ✅ Rileva supporto formato all'inizio
  useEffect(() => {
    if (isVideo) {
      const formatCheck = isFormatSupported(file.name, file.type);
      if (!formatCheck.supported) {
        setFormatNotSupported(true);
        setFormatReason(formatCheck.reason);
      }
    }
  }, [file.name, file.type, isVideo]);

  const handlePlayPause = () => {
    if (mediaRef.current) {
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleMute = () => {
    if (mediaRef.current) {
      mediaRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume;
    }
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
      setIsLoading(false);
    }
  };

  const handleError = (e: any) => {
    console.error('[MEDIA-VIEWER] Errore caricamento:', {
      error: e,
      src: file.path,
      errorCode: (mediaRef.current as HTMLVideoElement)?.error?.code,
      errorMessage: (mediaRef.current as HTMLVideoElement)?.error?.message
    });
    setIsLoading(false);

    // ✅ Se errore di codec/formato, mostra messaggio download
    const videoError = (mediaRef.current as HTMLVideoElement)?.error;
    if (videoError?.code === 4 || videoError?.message?.includes('codec') || videoError?.message?.includes('format')) {
      setFormatNotSupported(true);
      setFormatReason('Formato video non supportato dal browser. Il file originale è intatto e verificabile tramite hash SHA-256.');
    } else {
      setError('Failed to load media file');
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.path;
    link.download = file.name;
    link.click();
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (mediaRef.current) {
      mediaRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {file.name}
            </h3>
            <p className="text-xs text-gray-500">
              {isVideo ? 'Video' : 'Audio'} • {file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Unknown size'}
            </p>
          </div>

          <button
            onClick={handleDownload}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Media Container */}
      <div className="flex-1 flex items-center justify-center bg-black">
        {/* ✅ Messaggio formato non supportato */}
        {formatNotSupported && (
          <div className="text-center text-white p-8 max-w-md">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            <p className="text-sm mb-2 font-medium">Formato video non supportato</p>
            <p className="text-xs mb-4 text-gray-400">{formatReason}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              <Download className="w-4 h-4 inline mr-2" />
              Scarica file originale
            </button>
          </div>
        )}

        {/* ✅ Errore generico */}
        {error && !formatNotSupported && (
          <div className="text-center text-white p-8">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <p className="text-sm mb-4">{error}</p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              <Download className="w-4 h-4 inline mr-2" />
              Scarica file
            </button>
          </div>
        )}

        {/* ✅ Loading */}
        {isLoading && !error && !formatNotSupported && (
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-sm">Sto caricando il documento...</p>
          </div>
        )}

        {/* ✅ HTML5 Video nativo (solo se formato supportato) */}
        {!error && !formatNotSupported && isVideo && (
          <div className="w-full h-full flex items-center justify-center">
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={file.path}
              className="max-w-full max-h-full"
              controls
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleError}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
        )}

        {/* ✅ Audio player (HTML5 nativo) */}
        {!error && !isVideo && (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={file.path}
            controls
            className="w-full"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}
      </div>

      {/* Controls (solo per video, se non c'è errore) */}
      {!error && !formatNotSupported && isVideo && !isLoading && (
        <div className="p-4 bg-gray-900 text-white">
          {/* Progress Bar */}
          <div className="mb-3">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPause}
                className="p-2 hover:bg-gray-700 rounded"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>

              <span className="text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleMute}
                className="p-2 hover:bg-gray-700 rounded"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

