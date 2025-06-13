import { useEffect } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import { useCustomAudioRef, MediaSourceAppender, usePauseGlobalAudio } from '~/hooks/Audio';
import { globalAudioId } from '~/common';
import { logger } from '~/utils';
import store from '~/store';
import audioStore, { TTSAudioRequest } from '~/store/audio';

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

  const index = request?.index ?? 0;

  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const voice = useRecoilValue(store.voice);
  const setIsPlaying = useSetRecoilState(store.globalAudioPlayingFamily(index));
  const [audioRunId, setAudioRunId] = useRecoilState(store.audioRunFamily(index));
  const [isFetching, setIsFetching] = useRecoilState(store.globalAudioFetchingFamily(index));
  const [globalAudioURL, setGlobalAudioURL] = useRecoilState(store.globalAudioURLFamily(index));

  const { audioRef } = useCustomAudioRef({ setIsPlaying });
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);

  useEffect(() => {
    if (!request || !request.messageId || !token) {
      return;
    }

    const { messageId, runId } = request as TTSAudioRequest;

    async function fetchAudio() {
      setIsFetching(true);
      pauseGlobalAudio();

      try {
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
          setGlobalAudioURL(null);
        }

        let cacheKey = messageId;
        const cache = await caches.open('tts-responses');
        const cachedResponse = await cache.match(cacheKey);

        setAudioRunId(runId ?? null);
        if (cachedResponse) {
          logger.log('Audio found in cache');
          const audioBlob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(audioBlob);
          setGlobalAudioURL(blobUrl);
          setIsFetching(false);
          setRequest(null);
          return;
        }

        const response = await fetch('/api/files/speech/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messageId, runId, voice }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch audio');
        }
        if (!response.body) {
          throw new Error('Null Response body');
        }

        const reader = response.body.getReader();

        const type = 'audio/mpeg';
        const browserSupportsType = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
        let mediaSource: MediaSourceAppender | undefined;
        if (browserSupportsType) {
          mediaSource = new MediaSourceAppender(type);
          setGlobalAudioURL(mediaSource.mediaSourceUrl);
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
          logger.log('Adding audio to cache');
          const audioBlob = new Blob(chunks, { type });
          const cachedResponse = new Response(audioBlob);
          await cache.put(cacheKey, cachedResponse);
          if (!browserSupportsType) {
            const unconsumedResponse = await cache.match(cacheKey);
            if (unconsumedResponse) {
              const audioBlob = await unconsumedResponse.blob();
              const blobUrl = URL.createObjectURL(audioBlob);
              setGlobalAudioURL(blobUrl);
            }
          }
        }
        logger.log('Audio stream reading ended');
      } catch (error) {
        if (error?.['message'] !== promiseTimeoutMessage) {
          logger.log(promiseTimeoutMessage);
          return;
        }
        logger.error('Error fetching audio:', error);
        setGlobalAudioURL(null);
      } finally {
        setIsFetching(false);
        setRequest(null);
      }
    }

    if (!isFetching && runId !== audioRunId) {
      fetchAudio();
    }
  }, [request, token, voice, cacheTTS, audioRef, pauseGlobalAudio, setGlobalAudioURL, setAudioRunId, setIsFetching, audioRunId, isFetching, setRequest]);

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

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={audioRef}
      controls
      controlsList="nodownload nofullscreen noremoteplayback"
      style={{ position: 'absolute', overflow: 'hidden', display: 'none', height: '0px', width: '0px' }}
      src={globalAudioURL ?? undefined}
      id={globalAudioId}
      autoPlay
    />
  );
}
