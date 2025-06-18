import { useRecoilCallback } from 'recoil';
import store from '~/store';

export default function useAudioStateManager(messageId: string | null) {
  const setPlaying = useRecoilCallback(({ set }) => (value: boolean) => {
    set(store.globalAudioPlayingFamily(messageId), value);
  }, [messageId]);

  const setFetching = useRecoilCallback(({ set }) => (value: boolean) => {
    set(store.globalAudioFetchingFamily(messageId), value);
  }, [messageId]);

  const setURL = useRecoilCallback(({ set }) => (url: string | null) => {
    set(store.globalAudioURLFamily(messageId), url);
  }, [messageId]);

  const setRunId = useRecoilCallback(({ set }) => (runId: string | null) => {
    set(store.audioRunFamily(messageId), runId);
  }, [messageId]);

  const startRequest = (runId: string | null) => {
    setRunId(runId);
    setFetching(true);
    setPlaying(false);
  };

  const startPlaying = () => {
    setFetching(false);
    setPlaying(true);
  };

  const pausePlayback = () => {
    setPlaying(false);
  };

  const clearFetching = () => {
    setFetching(false);
  };

  const endPlayback = () => {
    setPlaying(false);
    setFetching(false);
    setURL(null);
    setRunId(null);
  };

  return {
    setURL,
    startRequest,
    startPlaying,
    clearFetching,
    pausePlayback,
    endPlayback,
  };
}
