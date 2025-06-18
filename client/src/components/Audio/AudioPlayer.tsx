import { useEffect } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { useAuthContext } from '~/hooks';
import { MediaSourceAppender, useCustomAudioRef, usePauseGlobalAudio, } from '~/hooks/Audio';
import AudioStateManager from '~/hooks/Audio/useAudioStateManager';
import store from '~/store';
import audioStore, { TTSAudioRequest } from '~/store/audio';
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
  const [request, setRequest] = useRecoilState(audioStore.ttsRequestAtom);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const voice = useRecoilValue(store.voice);

  const index = request?.index ?? 0;
  const messageId = request?.messageId ?? null;
  const stateManager = AudioStateManager.useAudioStateManager();
  const globalAudioURL = useRecoilValue(store.globalAudioURLFamily(messageId));
  const { audioRef } = useCustomAudioRef({
    stateManager,
    clearRequest: () => setRequest(null),
    messageId,
  });
  const { pauseGlobalAudio } = usePauseGlobalAudio(messageId);

  useEffect(() => {
    logger.log('[AudioPlayer] useEffect triggered, request:', request);
    
    if (!request || !request.messageId) {
      logger.log('[AudioPlayer] No valid request, skipping');
      return;
    }

    async function fetchAudio(req: TTSAudioRequest) {
      logger.log('[AudioPlayer] Starting fetchAudio for:', req.messageId);
      stateManager.startRequest(req.messageId, req.runId ?? null);
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
          stateManager.pausePlayback(req.messageId);
        }

        let cacheKey = req.messageId;
        const cache = await caches.open('tts-responses');
        const cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          logger.log('Audio found in cache for:', req.messageId);
          const audioBlob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(audioBlob);
          
          stateManager.startPlaying(req.messageId, blobUrl);
          
          // Explicitly try to play the audio
          setTimeout(() => {
            if (audioRef.current) {
              logger.log('Attempting to play cached audio for:', req.messageId);
              audioRef.current.play().catch(err => {
                logger.error('Error playing cached audio:', err);
                stateManager.endPlayback(req.messageId);
              });
            } else {
              // If audioRef is somehow not available, reset state
              stateManager.endPlayback(req.messageId);
            }
          }, 50);
          
          return;
        }

        logger.log('Fetching audio for:', req.messageId, navigator.userAgent);
        const response = await fetch('/api/files/speech/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messageId: req.messageId, runId: req.runId, voice: req.voice ?? voice }),
        });

        if (!response.ok || !response.body) {
          throw new Error('Failed to fetch audio');
        }

        const reader = response.body.getReader();
        const type = 'audio/mpeg';
        const browserSupportsType = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
        let mediaSource: MediaSourceAppender | undefined;
        if (browserSupportsType) {
          mediaSource = new MediaSourceAppender(type);
          stateManager.updateURL(req.messageId, mediaSource.mediaSourceUrl);
          logger.log('Created MediaSource for streaming');
        }

        let done = false;
        let started = false;
        const chunks: ArrayBuffer[] = [];
        while (!done) {
          const readPromise = reader.read();
          const { value, done: readerDone } = (await Promise.race([
            readPromise,
            timeoutPromise(maxPromiseTime, promiseTimeoutMessage),
          ])) as ReadableStreamReadResult<ArrayBuffer>;

          if (value) {
            if (!started) {
              started = true;
              // Force set isPlaying and clear isFetching to ensure UI transition
              // The play event may be unreliable in some browsers
              stateManager.startPlaying(req.messageId);
              logger.log('First audio chunk received, streaming started - setting UI state');
            }
            if (cacheTTS) {
              chunks.push(value);
            }
            if (mediaSource) {
              mediaSource.addData(value);
            }
          }
          done = readerDone;
        }

        if (chunks.length) {
          const audioBlob = new Blob(chunks, { type });
          const cachedResponse = new Response(audioBlob);
          await cache.put(cacheKey, cachedResponse);
          logger.log('Cached audio for:', req.messageId);
          if (!browserSupportsType) {
            const blobUrl = URL.createObjectURL(audioBlob);
            stateManager.updateURL(req.messageId, blobUrl);
          }
        }

        logger.log('Audio stream reading completed for:', req.messageId);
      } catch (error) {
        if (error?.['message'] === promiseTimeoutMessage) {
          logger.log(promiseTimeoutMessage);
        } else {
          logger.error('Error fetching audio for:', req.messageId, error);
        }
        stateManager.endPlayback(req.messageId);
      } finally {
        setRequest(null);
      }
    }

    fetchAudio(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.runId, request?.messageId]);

  useEffect(() => {
    if (
      playbackRate != null &&
      globalAudioURL != null &&
      playbackRate > 0 &&
      audioRef.current &&
      audioRef.current.playbackRate !== playbackRate
    ) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [audioRef, globalAudioURL, playbackRate]);

  useEffect(() => {
    pauseGlobalAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      src={globalAudioURL ?? undefined}
      id={globalAudioId}
      autoPlay
    />
  );
}
