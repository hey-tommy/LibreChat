import { useRecoilCallback, useSetRecoilState, useRecoilValue } from 'recoil';
import store from '~/store';
import audioStore from '~/store/audio';

class AudioStateManager {
  private setPlaying!: (id: string | null, val: boolean) => void;
  private setFetching!: (id: string | null, val: boolean) => void;
  private setURL!: (id: string | null, val: string | null) => void;
  private setRunId!: (id: string | null, val: string | null) => void;
  private setActiveMessageId!: (id: string | null) => void;
  public activeMessageId: string | null = null;

  static useAudioStateManager() {
    const setPlaying = useRecoilCallback(({ set }) => (id: string | null, val: boolean) =>
      set(store.globalAudioPlayingFamily(id), val),
    []);
    const setFetching = useRecoilCallback(({ set }) => (id: string | null, val: boolean) =>
      set(store.globalAudioFetchingFamily(id), val),
    []);
    const setURL = useRecoilCallback(({ set }) => (id: string | null, val: string | null) =>
      set(store.globalAudioURLFamily(id), val),
    []);
    const setRunId = useRecoilCallback(({ set }) => (id: string | null, val: string | null) =>
      set(store.audioRunFamily(id), val),
    []);
    const setActiveMessageId = useSetRecoilState(audioStore.activeAudioMessageIdAtom);
    const activeMessageId = useRecoilValue(audioStore.activeAudioMessageIdAtom);

    const manager = new AudioStateManager();
    manager.setPlaying = setPlaying;
    manager.setFetching = setFetching;
    manager.setURL = setURL;
    manager.setRunId = setRunId;
    manager.setActiveMessageId = setActiveMessageId;
    manager.activeMessageId = activeMessageId;
    return manager;
  }

  startRequest(messageId: string, runId: string | null) {
    if (this.activeMessageId && this.activeMessageId !== messageId) {
      this.resetState(this.activeMessageId);
    }
    this.setActiveMessageId(messageId);
    this.activeMessageId = messageId;
    this.setFetching(messageId, true);
    this.setPlaying(messageId, false);
    this.setRunId(messageId, runId);
    this.setURL(messageId, null);
  }

  startPlaying(messageId: string, url?: string | null) {
    if (messageId !== this.activeMessageId) return;
    this.setPlaying(messageId, true);
    this.setFetching(messageId, false);
    if (url !== undefined) {
      this.setURL(messageId, url);
    }
  }

  pausePlayback(messageId: string) {
    if (messageId !== this.activeMessageId) return;
    this.setPlaying(messageId, false);
  }

  updateURL(messageId: string, url: string | null) {
    if (messageId !== this.activeMessageId) return;
    this.setURL(messageId, url);
  }

  endPlayback(messageId: string) {
    if (messageId !== this.activeMessageId) return;
    this.resetState(messageId);
    this.setActiveMessageId(null);
    this.activeMessageId = null;
  }

  private resetState(messageId: string) {
    this.setPlaying(messageId, false);
    this.setFetching(messageId, false);
    this.setURL(messageId, null);
    this.setRunId(messageId, null);
  }
}

export default AudioStateManager;
