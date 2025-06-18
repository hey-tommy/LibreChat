import { useCallback } from 'react';
import { useRecoilCallback } from 'recoil';
import store from '~/store';
import audioStore from '~/store/audio';

export default function useAudioStateManager() {
  const setPlaying = useRecoilCallback(
    ({ set }) =>
      (messageId: string | null, value: boolean) => {
        set(store.globalAudioPlayingFamily(messageId), value);
      },
    [],
  );

  const setFetching = useRecoilCallback(
    ({ set }) =>
      (messageId: string | null, value: boolean) => {
        set(store.globalAudioFetchingFamily(messageId), value);
      },
    [],
  );

  const setURL = useRecoilCallback(
    ({ set }) =>
      (messageId: string | null, url: string | null) => {
        set(store.globalAudioURLFamily(messageId), url);
      },
    [],
  );

  const setRunId = useRecoilCallback(
    ({ set }) =>
      (messageId: string | null, runId: string | null) => {
        set(store.audioRunFamily(messageId), runId);
      },
    [],
  );

  const setActiveMessageId = useRecoilCallback(
    ({ set }) =>
      (messageId: string | null) => {
        set(audioStore.activeAudioMessageIdAtom, messageId);
      },
    [],
  );

  const startRequest = useCallback(
    (messageId: string | null, runId: string | null) => {
      if (!messageId) return;
      setActiveMessageId(messageId);
      setFetching(messageId, true);
      setPlaying(messageId, false);
      setRunId(messageId, runId);
    },
    [setActiveMessageId, setFetching, setPlaying, setRunId],
  );

  const startPlayback = useCallback(
    (messageId: string | null, url?: string | null) => {
      if (!messageId) return;
      setPlaying(messageId, true);
      setFetching(messageId, false);
      if (url !== undefined) {
        setURL(messageId, url);
      }
    },
    [setFetching, setPlaying, setURL],
  );

  const endPlayback = useCallback(
    (messageId: string | null) => {
      if (!messageId) return;
      setPlaying(messageId, false);
      setFetching(messageId, false);
      setRunId(messageId, null);
      setActiveMessageId(null);
    },
    [setActiveMessageId, setFetching, setPlaying, setRunId],
  );

  const resetState = useCallback(
    (messageId: string | null) => {
      if (!messageId) return;
      setPlaying(messageId, false);
      setFetching(messageId, false);
      setURL(messageId, null);
      setRunId(messageId, null);
    },
    [setFetching, setPlaying, setURL, setRunId],
  );

  return {
    startRequest,
    startPlayback,
    endPlayback,
    resetState,
    setURL,
    setRunId,
  };
}
