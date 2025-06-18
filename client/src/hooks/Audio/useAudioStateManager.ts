import { useRecoilCallback } from 'recoil';
import store from '~/store';

export default function useAudioStateManager() {
  return useRecoilCallback(({ set, snapshot }) => {
    const revokeUrl = async (messageId: string | null) => {
      const current = await snapshot.getPromise(store.globalAudioURLFamily(messageId));
      if (current) {
        URL.revokeObjectURL(current);
      }
    };

    return {
      requestStarted(messageId: string | null, runId?: string | null) {
        set(store.globalAudioFetchingFamily(messageId), true);
        set(store.globalAudioPlayingFamily(messageId), false);
        set(store.audioRunFamily(messageId), runId ?? null);
      },
      setUrl(messageId: string | null, url: string | null) {
        revokeUrl(messageId);
        set(store.globalAudioURLFamily(messageId), url);
        set(store.globalAudioFetchingFamily(messageId), false);
      },
      playbackStarted(messageId: string | null) {
        set(store.globalAudioPlayingFamily(messageId), true);
        set(store.globalAudioFetchingFamily(messageId), false);
      },
      playbackEnded(messageId: string | null) {
        revokeUrl(messageId);
        set(store.globalAudioURLFamily(messageId), null);
        set(store.globalAudioPlayingFamily(messageId), false);
        set(store.globalAudioFetchingFamily(messageId), false);
        set(store.activeRunFamily(messageId), null);
        set(store.audioRunFamily(messageId), null);
      },
      playbackError(messageId: string | null) {
        revokeUrl(messageId);
        set(store.globalAudioURLFamily(messageId), null);
        set(store.globalAudioPlayingFamily(messageId), false);
        set(store.globalAudioFetchingFamily(messageId), false);
      },
    };
  }, []);
}
