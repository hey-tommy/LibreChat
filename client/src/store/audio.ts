import { atom, useRecoilCallback, useSetRecoilState, useRecoilValue } from 'recoil';
import type { CallbackInterface } from 'recoil';
import families from './families';

// Destructure the required atoms from the default export of families.ts
const {
  globalAudioPlayingFamily,
  globalAudioFetchingFamily,
  globalAudioBufferingFamily,
  globalAudioURLFamily,
  audioRunFamily,
  audioErrorFamily,
  activeAudioMessageIdAtom,
} = families;

export type TTSAudioRequest = {
  messageId: string;
  runId?: string | null;
  index?: number;
  voice?: string;
};

export const ttsRequestAtom = atom<TTSAudioRequest | null>({
  key: 'ttsRequest',
  default: null,
});

export const stopAudioRequestAtom = atom<boolean>({
  key: 'stopAudioRequest',
  default: false,
});

// The New AudioStateManager Hook
export function useAudioStateManager() {
  const setPlaying = useRecoilCallback(
    ({ set }: CallbackInterface) =>
      (messageId: string | null, value: boolean) => {
        if (messageId) {
          set(globalAudioPlayingFamily(messageId), value);
        }
      },
    [],
  );

  const getIsPlaying = useRecoilCallback(
    ({ snapshot }: CallbackInterface) =>
      async (messageId: string) => {
        const isPlaying = await snapshot.getPromise(globalAudioPlayingFamily(messageId));
        return isPlaying;
      },
    [],
  );

  const setFetching = useRecoilCallback(
    ({ set }: CallbackInterface) =>
      (messageId: string | null, value: boolean) => {
        if (messageId) {
          set(globalAudioFetchingFamily(messageId), value);
        }
      },
    [],
  );

  const setBuffering = useRecoilCallback(
    ({ set }: CallbackInterface) =>
      (messageId: string | null, value: boolean) => {
        if (messageId) {
          set(globalAudioBufferingFamily(messageId), value);
        }
      },
    [],
  );

  const setURL = useRecoilCallback(
    ({ set }: CallbackInterface) =>
      (messageId: string | null, value: string | null) => {
        if (messageId) {
          set(globalAudioURLFamily(messageId), value);
        }
      },
    [],
  );

  const setRunId = useRecoilCallback(
    ({ set }: CallbackInterface) =>
      (messageId: string | null, value: string | null) => {
        if (messageId) {
          set(audioRunFamily(messageId), value);
        }
      },
    [],
  );

  const setError = useRecoilCallback(
    ({ set }: CallbackInterface) =>
      (messageId: string | null, value: Error | null) => {
        if (messageId) {
          set(audioErrorFamily(messageId), value);
        }
      },
    [],
  );

  const setActiveMessageId = useSetRecoilState(activeAudioMessageIdAtom);
  const activeMessageId = useRecoilValue(activeAudioMessageIdAtom);

  const resetState = (messageId: string) => {
    setPlaying(messageId, false);
    setFetching(messageId, false);
    setBuffering(messageId, false);
    setURL(messageId, null);
    setRunId(messageId, null);
    setError(messageId, null);
  };

  return {
    // Resets the state of a different message if a new one becomes active
    cleanupLastMessage: (newMessageId: string) => {
      if (activeMessageId && activeMessageId !== newMessageId) {
        resetState(activeMessageId);
      }
      setActiveMessageId(newMessageId);
    },
    // When a new request is initiated
    requestStarted: (messageId: string, runId: string) => {
      setFetching(messageId, true);
      setPlaying(messageId, false);
      setBuffering(messageId, false);
      setRunId(messageId, runId);
      setError(messageId, null);
    },
    // When the audio element begins buffering
    bufferingStarted: () => {
      if (activeMessageId) {
        setBuffering(activeMessageId, true);
        setFetching(activeMessageId, false);
      }
    },
    // When playback actually begins
    playbackStarted: (url: string | null = null) => {
      if (activeMessageId) {
        setPlaying(activeMessageId, true);
        setFetching(activeMessageId, false);
        setBuffering(activeMessageId, false);
        if (url) {
          setURL(activeMessageId, url);
        }
      }
    },
    // When playback is paused by the user or system
    playbackPaused: () => {
      if (activeMessageId) {
        setPlaying(activeMessageId, false);
      }
    },
    // When playback finishes naturally
    playbackFinished: () => {
      if (activeMessageId) {
        resetState(activeMessageId);
      }
      setActiveMessageId(null);
    },
    // When any error occurs
    playbackFailed: (error: Error) => {
      if (activeMessageId) {
        setError(activeMessageId, error);
        setPlaying(activeMessageId, false);
        setFetching(activeMessageId, false);
        setBuffering(activeMessageId, false);
        // Optional: auto-reset error state after a delay
        setTimeout(() => {
          setError(activeMessageId, null);
        }, 5000);
      }
    },
    // Get current playing state asynchronously
    getIsPlaying,
  };
}
