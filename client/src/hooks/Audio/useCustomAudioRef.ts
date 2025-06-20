import { useEffect, useRef } from 'react';
import type { useAudioStateManager } from '~/store/audio';

type TStateManager = ReturnType<typeof useAudioStateManager>;

interface CustomAudioElement extends HTMLAudioElement {
  customStarted?: boolean;
}

type TCustomAudioResult = { audioRef: React.MutableRefObject<CustomAudioElement | null> };

export default function useCustomAudioRef({
  stateManager,
}: {
  stateManager: TStateManager;
}): TCustomAudioResult {
  const audioRef = useRef<CustomAudioElement | null>(null);

  useEffect(() => {
    // Wait until the <audio> element is mounted
    if (!audioRef.current) {
      return;
    }

    const audioElement = audioRef.current;

    const handleEnded = () => {
      stateManager.playbackFinished();
    };

    const handleStart = () => {
      stateManager.playbackStarted(audioElement.src);
    };

    const handlePause = () => {
      stateManager.playbackPaused();
    };

    const handleError = (event: ErrorEvent | Event) => {
      const error =
        'error' in event && event.error
          ? (event.error as Error)
          : new Error('Unknown audio playback error');
      stateManager.playbackFailed(error);
    };

    const handleWaiting = () => {
      stateManager.bufferingStarted();
    };

    const handlePlaying = () => {
      stateManager.playbackStarted(audioElement.src);
    };

    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('play', handleStart);
    audioElement.addEventListener('playing', handlePlaying);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('error', handleError);
    audioElement.addEventListener('waiting', handleWaiting);

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('play', handleStart);
        audioElement.removeEventListener('playing', handlePlaying);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('error', handleError);
        audioElement.removeEventListener('waiting', handleWaiting);
      }
    };
  }, [stateManager]);

  return { audioRef };
}
