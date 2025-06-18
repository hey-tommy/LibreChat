import { useEffect, useRef } from 'react';

interface CustomAudioElement extends HTMLAudioElement {
  customStarted?: boolean;
  customEnded?: boolean;
  customPaused?: boolean;
  customProps?: {
    customStarted?: boolean;
    customEnded?: boolean;
    customPaused?: boolean;
  };
}

type TCustomAudioResult = { audioRef: React.MutableRefObject<CustomAudioElement | null> };

import type useAudioStateManager from './useAudioStateManager';

export default function useCustomAudioRef({
  messageId,
  stateManager,
  clearRequest,
}: {
  messageId: string | null;
  stateManager: ReturnType<typeof useAudioStateManager>;
  clearRequest?: () => void;
}): TCustomAudioResult {
  const audioRef = useRef<CustomAudioElement | null>(null);
  useEffect(() => {
    // Wait until the <audio> element is mounted
    if (!audioRef.current) {
      return;
    }

    const audioElement = audioRef.current;

    let lastTimeUpdate: number | null = null;
    let sameTimeUpdateCount = 0;

    const handleEnded = () => {
      stateManager.endPlayback(messageId);
      if (clearRequest) {
        clearRequest();
      }
      console.log('global audio ended');
      if (audioRef.current) {
        audioRef.current.customEnded = true;
      }
    };

    const handleStart = () => {
      stateManager.startPlayback(messageId);
      console.log('global audio started');
      if (audioRef.current) {
        audioRef.current.customStarted = true;
      }
    };

    const handlePause = () => {
      console.log('global audio paused');
      stateManager.endPlayback(messageId);
      if (audioRef.current) {
        audioRef.current.customPaused = true;
      }
    };

    const handleTimeUpdate = () => {
      if (audioRef.current) {
        const currentTime = audioRef.current.currentTime;
        // console.log('Current time: ', currentTime);

        if (currentTime === lastTimeUpdate) {
          sameTimeUpdateCount += 1;
        } else {
          sameTimeUpdateCount = 0;
        }

        lastTimeUpdate = currentTime;

        if (sameTimeUpdateCount >= 1) {
          console.log('Detected end of audio based on time update');
          audioRef.current.pause();
          handleEnded();
        }
      }
    };

    if (audioRef.current) {
      audioRef.current.addEventListener('ended', handleEnded);
      audioRef.current.addEventListener('play', handleStart);
      audioRef.current.addEventListener('pause', handlePause);
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);

      audioRef.current.customProps = {
        customStarted: false,
        customEnded: false,
        customPaused: false,
      };
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('play', handleStart);
        audioElement.removeEventListener('pause', handlePause);
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        if (audioElement.customEnded || audioElement.customPaused) {
          URL.revokeObjectURL(audioElement.src);
        }
      }
    };
  }, [stateManager, messageId]);

  return { audioRef };
}
