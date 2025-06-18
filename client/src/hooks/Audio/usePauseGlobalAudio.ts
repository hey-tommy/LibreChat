import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { globalAudioId } from '~/common';
import store from '~/store';
import { useAudioStateManager } from '.';

function usePauseGlobalAudio(messageId: string | null = null) {
  const stateManager = useAudioStateManager();
  const [globalAudioURL, setGlobalAudioURL] = useRecoilState(
    store.globalAudioURLFamily(messageId),
  );

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL != null && globalAudioURL !== '') {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
      }
      URL.revokeObjectURL(globalAudioURL);
      setGlobalAudioURL(null);
      stateManager.endPlayback(messageId);
    }
  }, [globalAudioURL, setGlobalAudioURL, stateManager, messageId]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
