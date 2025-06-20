import { useEffect, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useAuthContext } from '~/hooks';
import { MediaSourceAppender, useCustomAudioRef } from '~/hooks/Audio';
import store from '~/store';
import { ttsRequestAtom, useAudioStateManager, stopAudioRequestAtom } from '~/store/audio';
import { globalAudioId } from '~/common';
import { logger } from '~/utils';

const promiseTimeoutMessage = 'Reader promise timed out';
const maxPromiseTime = 120000;  // 15 secs was way too agressive for local TTS

function timeoutPromise(ms: number, message?: string) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message ?? 'Promise timed out')), ms),
  );
}

export default function AudioPlayer() {
  const { token } = useAuthContext();
  const [request, setRequest] = useRecoilState(ttsRequestAtom);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const voice = useRecoilValue(store.voice);

  const stateManager = useAudioStateManager();
  const { audioRef } = useCustomAudioRef({ stateManager });

  const [stopRequest, setStopRequest] = useRecoilState(stopAudioRequestAtom);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request || !request.messageId) {
      return;
    }

    // Destructure after the guard to create constants with guaranteed non-null types.
    // This is the key fix to resolve the persistent TypeScript error.
    const { messageId, runId, voice: reqVoice } = request;

    (async () => {
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      // Now, use the guaranteed non-null `messageId` and `runId` constants.
      stateManager.cleanupLastMessage(messageId);
      stateManager.requestStarted(messageId, runId ?? '');

      try {
        if (audioRef.current) {
          audioRef.current.pause();
          if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
          }
        }

        const cacheKey = messageId;
        const cache = await caches.open('tts-responses');
        const cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          logger.log('Audio found in cache for:', messageId);
          const audioBlob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(audioBlob);

          if (audioRef.current) {
            audioRef.current.src = blobUrl;
            await audioRef.current.play();
          }
          return;
        }

        logger.log('Fetching audio for:', messageId, navigator.userAgent);
        const response = await fetch('/api/files/speech/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messageId: messageId,
            runId: runId,
            voice: reqVoice ?? voice,
          }),
          signal,
        });

        if (!response.ok || !response.body) {
          throw new Error('Failed to fetch audio');
        }

        const reader = response.body.getReader();
        const type = 'audio/mpeg';
        const browserSupportsType =
          typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
        let mediaSource: MediaSourceAppender | undefined;
        if (browserSupportsType) {
          mediaSource = new MediaSourceAppender(type);
          if (audioRef.current) {
            audioRef.current.src = mediaSource.mediaSourceUrl;
          }
          logger.log('Created MediaSource for streaming');
        }

        let done = false;
        const chunks: ArrayBuffer[] = [];
        while (!done) {
          const readPromise = reader.read();
          const { value, done: readerDone } = (await Promise.race([
            readPromise,
            timeoutPromise(maxPromiseTime, promiseTimeoutMessage),
          ])) as ReadableStreamReadResult<ArrayBuffer>;

          if (value) {
            if (cacheTTS) {
              chunks.push(value);
            }
            if (mediaSource) {
              mediaSource.addData(value);
            }
          }
          done = readerDone;
        }

        if (mediaSource) {
          await mediaSource.awaitProcessing();
          mediaSource.close();
        }

        // First, ask the state manager for the LATEST "isPlaying" status.
        const isAlreadyPlaying = await stateManager.getIsPlaying(messageId);

        if (!isAlreadyPlaying) {
          // If the state manager confirms playback hasn't started,
          // we know our race condition occurred. We take charge and
          // issue the explicit play command.
          if (audioRef.current) {
            logger.log('Fetch completed before playback event; issuing explicit play command.');
            await audioRef.current.play();
          }
        }

        if (chunks.length) {
          const audioBlob = new Blob(chunks, { type });
          const cachedResponse = new Response(audioBlob);
          await cache.put(cacheKey, cachedResponse);
          logger.log('Cached audio for:', messageId);
          if (!browserSupportsType && audioRef.current) {
            const blobUrl = URL.createObjectURL(audioBlob);
            audioRef.current.src = blobUrl;
          }
        }

        logger.log('Audio stream reading completed for:', messageId);
      } catch (error) {
        if (signal.aborted) {
          logger.log('Audio fetch aborted for:', messageId);
          stateManager.playbackFinished();
          return;
        }
        logger.error('Error fetching/playing audio for:', messageId, error);
        stateManager.playbackFailed(error as Error);
      } finally {
        if (request && runId === request.runId) {
          setRequest(null);
        }
      }
    })();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [request?.messageId, request?.runId]);

  useEffect(() => {
    // This effect handles the global stop command
    if (stopRequest) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setStopRequest(false); // Reset the stop request
    }
  }, [stopRequest, setStopRequest]);

  useEffect(() => {
    const currentRate = playbackRate ?? 1;
    if (
      currentRate > 0 &&
      audioRef.current &&
      audioRef.current.playbackRate !== currentRate &&
      audioRef.current.src
    ) {
      audioRef.current.playbackRate = currentRate;
    }
  }, [playbackRate, audioRef.current?.src]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={audioRef}
      controls
      controlsList="nodownload nofullscreen noremoteplayback"
      style={{
        position: 'absolute',
        overflow: 'hidden',
        display: 'none',
        height: '0px',
        width: '0px',
      }}
      id={globalAudioId}
      autoPlay
    />
  );
}
