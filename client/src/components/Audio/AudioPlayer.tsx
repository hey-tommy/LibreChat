import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import { MediaSourceAppender, useCustomAudioRef, usePauseGlobalAudio } from '~/hooks/Audio';
import store from '~/store';
import { ttsRequestAtom } from '~/store/audio';
import { globalAudioId } from '~/common';
import { logger } from '~/utils';

function timeoutPromise(ms: number, message?: string) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message ?? 'Promise timed out')), ms),
  );
}

const promiseTimeoutMessage = 'Reader promise timed out';
const maxPromiseTime = 15000;

export default function AudioPlayer() {
  const { token } = useAuthContext();
  const request = useRecoilValue(ttsRequestAtom);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const voice = useRecoilValue(store.voice);

  const index = request?.index ?? 0;
  const [audioRunId, setAudioRunId] = useRecoilState(store.audioRunFamily(index));
  const [isFetching, setIsFetching] = useRecoilState(store.globalAudioFetchingFamily(index));
  const [globalAudioURL, setGlobalAudioURL] = useRecoilState(store.globalAudioURLFamily(index));
  const setIsPlaying = useRecoilState(store.globalAudioPlayingFamily(index))[1];

  const { audioRef } = useCustomAudioRef({ setIsPlaying });
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);

  useEffect(() => {
    if (!request) {
      pauseGlobalAudio();
      return;
    }

    const { messageId, runId } = request;
    if (!token || !messageId || !runId || isFetching || runId === audioRunId) {
      return;
    }

    async function fetchAudio() {
      setIsFetching(true);

      try {
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
          setGlobalAudioURL(null);
        }

        let cacheKey = messageId;
        const cache = await caches.open('tts-responses');
        const cachedResponse = await cache.match(cacheKey);

        setAudioRunId(runId);
        if (cachedResponse) {
          logger.log('Audio found in cache');
          const audioBlob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(audioBlob);
          setGlobalAudioURL(blobUrl);
          setIsFetching(false);
          return;
        }

        logger.log('Fetching audio...', navigator.userAgent);
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
      } catch (error) {
        if (error?.['message'] !== promiseTimeoutMessage) {
          logger.log(promiseTimeoutMessage);
          return;
        }
        logger.error('Error fetching audio:', error);
        setGlobalAudioURL(null);
      } finally {
        setIsFetching(false);
      }
    }

    fetchAudio();
  }, [request, token, voice, audioRef, audioRunId, isFetching, cacheTTS, pauseGlobalAudio, setAudioRunId, setGlobalAudioURL, setIsFetching]);

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
