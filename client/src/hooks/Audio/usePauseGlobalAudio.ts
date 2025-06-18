import { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { globalAudioId } from '~/common';
import store from '~/store';
import useAudioStateManager from './useAudioStateManager';

function usePauseGlobalAudio(messageId: string | null = null) {
  const { clear, stopPlayback } = useAudioStateManager(messageId);
  const globalAudioURL = useRecoilValue(store.globalAudioURLFamily(messageId));

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL != null && globalAudioURL !== '') {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
        stopPlayback();
      }
      clear();
    }
  }, [clear, globalAudioURL, stopPlayback]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
