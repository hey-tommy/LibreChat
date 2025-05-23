import { useRecoilValue } from 'recoil';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { MediaSourceAppender } from '~/hooks/Audio';
import { useTextToSpeechMutation, useVoicesQuery } from '~/data-provider';
import { useToastContext } from '~/Providers/ToastContext';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

const createFormData = (text: string, voice: string) => {
  const formData = new FormData();
  formData.append('input', text);
  formData.append('voice', voice);
  return formData;
};

type TUseTTSExternal = {
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  messageId?: string;
  isLast: boolean;
  index?: number;
};

function useTextToSpeechExternal({
  setIsSpeaking,
  audioRef,
  messageId,
  isLast,
  index = 0,
}: TUseTTSExternal) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const voice = useRecoilValue(store.voice);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const streamManualTTS = useRecoilValue(store.streamManualTTS);
  const playbackRate = useRecoilValue(store.playbackRate);

  const [downloadFile, setDownloadFile] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const promiseAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSourceAppender | null>(null);
  const streamUrlRef = useRef<string | null>(null);

  /* Global Audio Variables */
  const globalIsFetching = useRecoilValue(store.globalAudioFetchingFamily(index));
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const autoPlayAudio = (blobUrl: string) => {
    if (!audioRef.current) {
      return;
    }
    try {
      audioRef.current.pause();
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current.src = blobUrl;
      if (playbackRate != null && playbackRate > 0) {
        audioRef.current.playbackRate = playbackRate;
      }
      audioRef.current
        .play()
        .then(() => setIsSpeaking(true))
        .catch((error: Error) => {
          showToast({
            message: localize('com_nav_audio_play_error', { 0: error.message }),
            status: 'error',
          });
        });
    } catch (error) {
      console.error('Error playing audio', error);
    }
  };

  const playAudioPromise = (blobUrl: string) => {
    if (!audioRef.current) {
      return;
    }

    const audio = audioRef.current;
    audio.pause();
    if (audio.src) {
      URL.revokeObjectURL(audio.src);
    }
    audio.src = blobUrl;
    if (playbackRate != null && playbackRate > 0) {
      audio.playbackRate = playbackRate;
    }

    const playPromise = () => audio.play().then(() => setIsSpeaking(true));

    playPromise().catch((error: Error) => {
      if (
        error.message &&
        error.message.includes('The play() request was interrupted by a call to pause()')
      ) {
        console.log('Play request was interrupted by a call to pause()');
        return playPromise().catch(console.error);
      }
      console.error(error);
      showToast({
        message: localize('com_nav_audio_play_error', { 0: error.message }),
        status: 'error',
      });
    });

    audio.onended = () => {
      console.log('Cached message audio ended');
      URL.revokeObjectURL(blobUrl);
      setIsSpeaking(false);
    };

    promiseAudioRef.current = audio;
  };

  const downloadAudio = (blobUrl: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'audio.mp3';
    a.click();
    setDownloadFile(false);
  };

  const { mutate: processAudio, isLoading } = useTextToSpeechMutation({
    onMutate: (variables) => {
      const inputText = (variables.get('input') ?? '') as string;
      if (inputText.length >= 4096) {
        showToast({
          message: localize('com_nav_long_audio_warning'),
          status: 'warning',
        });
      }
    },
    onSuccess: async (data: ArrayBuffer, variables) => {
      try {
        const inputText = (variables.get('input') ?? '') as string;
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });

        if (cacheTTS && inputText) {
          const cache = await caches.open('tts-responses');
          const request = new Request(inputText);
          const response = new Response(audioBlob);
          cache.put(request, response);
        }

        const blobUrl = URL.createObjectURL(audioBlob);
        if (downloadFile) {
          downloadAudio(blobUrl);
        }
        autoPlayAudio(blobUrl);
      } catch (error) {
        showToast({
          message: `Error processing audio: ${(error as Error).message}`,
          status: 'error',
        });
      }
    },
    onError: (error: unknown) => {
      showToast({
        message: localize('com_nav_audio_process_error', { 0: (error as Error).message }),
        status: 'error',
      });
    },
  });

  const startMutation = (text: string, download: boolean) => {
    const formData = createFormData(text, voice ?? '');
    setDownloadFile(download);
    processAudio(formData);
  };

  const startStreaming = async (text: string, download: boolean) => {
    const formData = createFormData(text, voice ?? '');
    setDownloadFile(download);
    setIsStreaming(true);
    try {
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch('/api/files/speech/tts/manual', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to fetch audio');
      }

      const reader = response.body.getReader();
      const type = 'audio/mpeg';
      const browserSupportsType =
        typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
      const chunks: ArrayBuffer[] = [];
      let mediaSource: MediaSourceAppender | null = null;

      if (browserSupportsType) {
        mediaSource = new MediaSourceAppender(type);
        mediaSourceRef.current = mediaSource;
        streamUrlRef.current = mediaSource.mediaSourceUrl;
        autoPlayAudio(streamUrlRef.current);
      }

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (value) {
          const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
          if (cacheTTS) {
            chunks.push(buffer);
          }
          if (browserSupportsType && mediaSource) {
            mediaSource.addData(buffer);
          }
        }
        done = readerDone;
      }

      mediaSource?.close();

      if (chunks.length) {
        const audioBlob = new Blob(chunks, { type });
        if (cacheTTS && text) {
          const cache = await caches.open('tts-responses');
          await cache.put(new Request(text), new Response(audioBlob));
        }
        if (!browserSupportsType) {
          const blobUrl = URL.createObjectURL(audioBlob);
          streamUrlRef.current = blobUrl;
          autoPlayAudio(blobUrl);
          if (download) {
            downloadAudio(blobUrl);
          }
        } else if (download) {
          const blobUrl = URL.createObjectURL(audioBlob);
          downloadAudio(blobUrl);
        }
      }
    } catch (error) {
      showToast({
        message: localize('com_nav_audio_process_error', { 0: (error as Error).message }),
        status: 'error',
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const generateSpeechExternal = (text: string, download: boolean) => {
    if (streamManualTTS) {
      startStreaming(text, download);
      return;
    }

    if (cacheTTS) {
      handleCachedResponse(text, download);
    } else {
      startMutation(text, download);
    }
  };

  const handleCachedResponse = async (text: string, download: boolean) => {
    const cachedResponse = await caches.match(text);
    if (!cachedResponse) {
      return startMutation(text, download);
    }
    const audioBlob = await cachedResponse.blob();
    const blobUrl = URL.createObjectURL(audioBlob);
    if (download) {
      downloadAudio(blobUrl);
    } else {
      playAudioPromise(blobUrl);
    }
  };

  const cancelSpeech = () => {
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    const pauseAudio = (currentElement: HTMLAudioElement | null) => {
      if (currentElement) {
        currentElement.pause();
        currentElement.src && URL.revokeObjectURL(currentElement.src);
        audioRef.current = null;
      }
    };
    pauseAudio(messageAudio);
    pauseAudio(promiseAudioRef.current);
    pauseAudio(audioRef.current);
    if (streamUrlRef.current) {
      URL.revokeObjectURL(streamUrlRef.current);
      streamUrlRef.current = null;
    }
    if (mediaSourceRef.current) {
      mediaSourceRef.current.close();
      mediaSourceRef.current = null;
    }
    setIsSpeaking(false);
  };

  const cancelPromiseSpeech = useCallback(() => {
    if (promiseAudioRef.current) {
      promiseAudioRef.current.pause();
      promiseAudioRef.current.src && URL.revokeObjectURL(promiseAudioRef.current.src);
      promiseAudioRef.current = null;
      setIsSpeaking(false);
    }
  }, [setIsSpeaking]);

  useEffect(() => cancelPromiseSpeech, [cancelPromiseSpeech]);

  const isFetching = useMemo(
    () => isLast && globalIsFetching && !globalIsPlaying,
    [globalIsFetching, globalIsPlaying, isLast],
  );

  const { data: voicesData = [] } = useVoicesQuery();

  return {
    generateSpeechExternal,
    cancelSpeech,
    isLoading: isFetching || isLoading || isStreaming,
    audioRef,
    voices: voicesData,
  };
}

export default useTextToSpeechExternal;
