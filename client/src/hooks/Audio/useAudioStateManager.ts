import { useCallback } from 'react';
import { useSetRecoilState, useRecoilState } from 'recoil';
import store from '~/store';

export default function useAudioStateManager(messageId: string | null = null) {
  const [audioURL, setAudioURL] = useRecoilState(store.globalAudioURLFamily(messageId));
  const setIsFetching = useSetRecoilState(store.globalAudioFetchingFamily(messageId));
  const setIsPlaying = useSetRecoilState(store.globalAudioPlayingFamily(messageId));
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(messageId));
  const setAudioRunId = useSetRecoilState(store.audioRunFamily(messageId));

  const startRequest = useCallback(
    (runId?: string | null) => {
      setIsFetching(true);
      if (runId !== undefined) {
        setAudioRunId(runId);
        setActiveRunId(runId);
      }
    },
    [setIsFetching, setAudioRunId, setActiveRunId],
  );

  const finishRequest = useCallback(() => {
    setIsFetching(false);
  }, [setIsFetching]);

  const setURL = useCallback(
    (url: string | null) => {
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
      setAudioURL(url);
    },
    [audioURL, setAudioURL],
  );

  const startPlayback = useCallback(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const clear = useCallback(() => {
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }
    setAudioURL(null);
    setIsPlaying(false);
    setIsFetching(false);
    setActiveRunId(null);
    setAudioRunId(null);
  }, [audioURL, setAudioURL, setIsPlaying, setIsFetching, setActiveRunId, setAudioRunId]);

  return {
    startRequest,
    finishRequest,
    startPlayback,
    stopPlayback,
    setURL,
    clear,
  };
}
