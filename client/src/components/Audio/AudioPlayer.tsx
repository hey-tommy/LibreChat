import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useAuthContext } from '~/hooks';
import { MediaSourceAppender, useCustomAudioRef, usePauseGlobalAudio, useAudioStateManager } from '~/hooks/Audio';
import store from '~/store';
import audioStore, { TTSAudioRequest } from '~/store/audio';
import { globalAudioId } from '~/common';
import { logger } from '~/utils';

const promiseTimeoutMessage = 'Reader promise timed out';
const maxPromiseTime = 15000;

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

  const messageId = request?.messageId ?? null;
  const audioManager = useAudioStateManager(messageId);
  const [globalAudioURL] = useRecoilState(store.globalAudioURLFamily(messageId));
  const { audioRef } = useCustomAudioRef({
    onPlay: audioManager.startPlayback,
    onPause: audioManager.stopPlayback,
    onEnded: audioManager.stopPlayback,
  });
  const { pauseGlobalAudio } = usePauseGlobalAudio(messageId);

  useEffect(() => {
    if (!request) {
      return;
    }

    async function fetchAudio(req: TTSAudioRequest) {
      audioManager.startRequest(req.runId ?? null);
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioManager.setURL(null);
        }

        let cacheKey = req.messageId;
        const cache = await caches.open('tts-responses');
        const cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          logger.log('Audio found in cache');
          const audioBlob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(audioBlob);
          audioManager.setURL(blobUrl);
          audioManager.finishRequest();
          setRequest(null);
          return;
        }

        logger.log('Fetching audio...', navigator.userAgent);
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
          audioManager.setURL(mediaSource.mediaSourceUrl);
        }

        let done = false;
        const chunks: ArrayBuffer[] = [];
        while (!done) {
          const readPromise = reader.read();
          const { value, done: readerDone } = (await Promise.race([
            readPromise,
            timeoutPromise(maxPromiseTime, promiseTimeoutMessage),
          ])) as ReadableStreamReadResult<ArrayBuffer>;

          if (cacheTTS && value) {
            chunks.push(value);
          }
          if (value && mediaSource) {
            mediaSource.addData(value);
          }
          done = readerDone;
        }

        if (chunks.length) {
          const audioBlob = new Blob(chunks, { type });
          const cachedResponse = new Response(audioBlob);
          await cache.put(cacheKey, cachedResponse);
          if (!browserSupportsType) {
            const blobUrl = URL.createObjectURL(audioBlob);
            audioManager.setURL(blobUrl);
          }
        }

        logger.log('Audio stream reading ended');
      } catch (error) {
        if (error?.['message'] !== promiseTimeoutMessage) {
          logger.log(promiseTimeoutMessage);
          return;
        }
        logger.error('Error fetching audio:', error);
        audioManager.setURL(null);
      } finally {
        audioManager.finishRequest();
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
