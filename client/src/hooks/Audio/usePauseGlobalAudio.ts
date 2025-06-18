import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { globalAudioId } from '~/common';
import AudioStateManager from './useAudioStateManager';
import store from '~/store';

function usePauseGlobalAudio(messageId: string | null = null) {
  const stateManager = AudioStateManager.useAudioStateManager();
  const globalAudioURL = useRecoilValue(store.globalAudioURLFamily(messageId));

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL != null && globalAudioURL !== '') {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
      }
      URL.revokeObjectURL(globalAudioURL);
      stateManager.endPlayback(messageId ?? stateManager.activeMessageId ?? '');
    }
  }, [globalAudioURL, messageId, stateManager]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
