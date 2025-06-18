import { useCallback } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { globalAudioId } from '~/common';
import store from '~/store';

function usePauseGlobalAudio(messageId: string | null = null) {
  /* Global Audio Variables */
  const setAudioRunId = useSetRecoilState(store.audioRunFamily(messageId));
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(messageId));
  const setGlobalIsPlaying = useSetRecoilState(store.globalAudioPlayingFamily(messageId));
  const setIsGlobalAudioFetching = useSetRecoilState(store.globalAudioFetchingFamily(messageId));
  const [globalAudioURL, setGlobalAudioURL] = useRecoilState(store.globalAudioURLFamily(messageId));

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL != null && globalAudioURL !== '') {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
        setGlobalIsPlaying(false);
      }
      URL.revokeObjectURL(globalAudioURL);
      setIsGlobalAudioFetching(false);
      setGlobalAudioURL(null);
      setActiveRunId(null);
      setAudioRunId(null);
    }
  }, [
    setAudioRunId,
    setActiveRunId,
    globalAudioURL,
    setGlobalAudioURL,
    setGlobalIsPlaying,
    setIsGlobalAudioFetching,
  ]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
