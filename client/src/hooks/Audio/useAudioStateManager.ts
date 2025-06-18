import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

/**
 * Centralized manager for audio-related UI state. Ensures that
 * all mutations originate from a single place to prevent race conditions.
 */
export default function useAudioStateManager(messageId: string | null = null) {
  const setIsPlaying = useSetRecoilState(store.globalAudioPlayingFamily(messageId));
  const setIsFetching = useSetRecoilState(store.globalAudioFetchingFamily(messageId));
  const setAudioURL = useSetRecoilState(store.globalAudioURLFamily(messageId));
  const setAudioRunId = useSetRecoilState(store.audioRunFamily(messageId));
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(messageId));

  const requestStarted = useCallback(
    (runId: string | null) => {
      setIsFetching(true);
      setAudioRunId(runId);
    },
    [setIsFetching, setAudioRunId],
  );

  const requestFinished = useCallback(() => {
    setIsFetching(false);
    setAudioRunId(null);
  }, [setIsFetching, setAudioRunId]);

  const playbackStarted = useCallback(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);

  const playbackFinished = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const resetState = useCallback(() => {
    setIsPlaying(false);
    setIsFetching(false);
    setAudioURL(null);
    setActiveRunId(null);
    setAudioRunId(null);
  }, [setIsPlaying, setIsFetching, setAudioURL, setActiveRunId, setAudioRunId]);

  return {
    requestStarted,
    requestFinished,
    playbackStarted,
    playbackFinished,
    setAudioURL,
    resetState,
  };
}
