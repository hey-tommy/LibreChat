import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { MediaSourceAppender, useCustomAudioRef } from '~/hooks/Audio';
import { useAuthContext } from '~/hooks';
import { globalAudioId } from '~/common';
import { logger } from '~/utils';
import store from '~/store';
import { ttsRequestAtom } from '~/store/audio';

function timeoutPromise(ms: number, message?: string) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message ?? 'Promise timed out')), ms),
  );
}

const promiseTimeoutMessage = 'Reader promise timed out';
const maxPromiseTime = 15000;

export default function AudioPlayer() {
  const { token } = useAuthContext();
  const [request, setRequest] = useRecoilState(ttsRequestAtom);
  const voice = useRecoilValue(store.voice);
  const playbackRate = useRecoilValue(store.playbackRate);
  const { audioRef } = useCustomAudioRef({ setIsPlaying: () => {} });

  useEffect(() => {
    if (!request || !token) {
      return;
    }

    async function fetchAudio() {
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
        }

        if (request.text) {
          const formData = new FormData();
          formData.append('input', request.text);
          formData.append('voice', voice ?? '');
          const response = await fetch('/api/files/speech/tts/manual', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (!response.ok) {
            throw new Error('Failed to fetch audio');
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          if (audioRef.current) {
            audioRef.current.src = url;
          }
        } else if (request.messageId && request.runId) {
          const response = await fetch('/api/files/speech/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messageId: request.messageId,
              runId: request.runId,
              voice,
            }),
          });
          if (!response.ok || !response.body) {
            throw new Error('Failed to fetch audio');
          }
          const reader = response.body.getReader();
          const type = 'audio/mpeg';
          const supports =
            typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
          const chunks: ArrayBuffer[] = [];
          let mediaSource: MediaSourceAppender | undefined;
          if (supports) {
            mediaSource = new MediaSourceAppender(type);
            if (audioRef.current) {
              audioRef.current.src = mediaSource.mediaSourceUrl;
            }
          }
          let done = false;
          while (!done) {
            const readPromise = reader.read();
            const { value, done: readerDone } = (await Promise.race([
              readPromise,
              timeoutPromise(maxPromiseTime, promiseTimeoutMessage),
            ])) as ReadableStreamReadResult<ArrayBuffer>;
            if (value && mediaSource) {
              mediaSource.addData(value);
            } else if (value) {
              chunks.push(value);
            }
            done = readerDone;
          }
          if (!supports) {
            const blob = new Blob(chunks, { type });
            const url = URL.createObjectURL(blob);
            if (audioRef.current) {
              audioRef.current.src = url;
            }
          }
          mediaSource?.close();
        }

        if (audioRef.current) {
          if (playbackRate != null && playbackRate > 0) {
            audioRef.current.playbackRate = playbackRate;
          }
          await audioRef.current.play().catch(logger.error);
        }
      } catch (error) {
        logger.error('Error fetching audio:', error);
      } finally {
        setRequest(null);
      }
    }

    fetchAudio();
  }, [request, token, voice, playbackRate, audioRef, setRequest]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={audioRef}
      id={globalAudioId}
      controls
      style={{ display: 'none' }}
    />
  );
}
