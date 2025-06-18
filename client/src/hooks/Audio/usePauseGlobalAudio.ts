import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { globalAudioId } from '~/common';
import store from '~/store';
import useAudioStateManager from './useAudioStateManager';

function usePauseGlobalAudio(messageId: string | null = null) {
  const [globalAudioURL, setGlobalAudioURL] = useRecoilState(
    store.globalAudioURLFamily(messageId),
  );
  const {
    resetState,
    playbackFinished,
  } = useAudioStateManager(messageId);

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL != null && globalAudioURL !== '') {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
        playbackFinished();
      }
      URL.revokeObjectURL(globalAudioURL);
      setGlobalAudioURL(null);
      resetState();
    }
  }, [
    globalAudioURL,
    setGlobalAudioURL,
    resetState,
    playbackFinished,
  ]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
