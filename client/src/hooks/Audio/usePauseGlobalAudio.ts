import { useCallback } from 'react';
import { globalAudioId } from '~/common';
import { useAudioStateManager } from '.';

function usePauseGlobalAudio(messageId: string | null = null) {
  const audioManager = useAudioStateManager();
  const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudio) {
      globalAudio.pause();
    }
    audioManager.playbackEnded(messageId);
  }, [audioManager, globalAudio, messageId]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
