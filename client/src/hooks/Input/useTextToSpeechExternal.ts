import { useRecoilValue } from 'recoil';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTextToSpeechMutation, useVoicesQuery } from '~/data-provider';
import { useToastContext } from '~/Providers/ToastContext';
import useLocalize from '~/hooks/useLocalize';
import { MediaSourceAppender, usePauseGlobalAudio } from '../Audio';
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
  const voice = useRecoilValue(store.voice);
  const cacheTTS = useRecoilValue(store.cacheTTS);
  const playbackRate = useRecoilValue(store.playbackRate);
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);

  const [downloadFile, setDownloadFile] = useState(false);

  const promiseAudioRef = useRef<HTMLAudioElement | null>(null);

  /* Global Audio Variables */
  const globalIsFetching = useRecoilValue(store.globalAudioFetchingFamily(index));
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const autoPlayAudio = async (blobUrl: string) => {
    if (!audioRef.current) {
      return;
    }
    pauseGlobalAudio();
    audioRef.current.src = blobUrl;
    if (playbackRate != null && playbackRate > 0 && audioRef.current.playbackRate !== playbackRate) {
      audioRef.current.playbackRate = playbackRate;
    }
    try {
      await audioRef.current.play();
    } catch (error) {
      showToast({
        message: localize('com_nav_audio_play_error', { 0: (error as Error).message }),
        status: 'error',
      });
    }
  };

  const playAudioPromise = async (blobUrl: string) => {
    if (!audioRef.current) {
      return;
    }
    pauseGlobalAudio();
    audioRef.current.src = blobUrl;
    if (playbackRate != null && playbackRate > 0 && audioRef.current.playbackRate !== playbackRate) {
      audioRef.current.playbackRate = playbackRate;
    }
    try {
      await audioRef.current.play();
      setIsSpeaking(true);
    } catch (error) {
      if (
        (error as Error).message &&
        (error as Error).message.includes('The play() request was interrupted by a call to pause()')
      ) {
        try {
          await audioRef.current.play();
          setIsSpeaking(true);
          return;
        } catch (inner) {
          console.error(inner);
        }
      }
      console.error(error);
      showToast({
        message: localize('com_nav_audio_play_error', { 0: (error as Error).message }),
        status: 'error',
      });
    }

    promiseAudioRef.current = audioRef.current;
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
    onSuccess: async (data: ArrayBuffer | Response, variables) => {
      try {
        const inputText = (variables.get('input') ?? '') as string;

        if (data instanceof Response && data.body) {
          const reader = data.body.getReader();
          const type = 'audio/mpeg';
          const browserSupportsType =
            typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
          let mediaSource: MediaSourceAppender | undefined;
          const chunks: Uint8Array[] = [];

          if (browserSupportsType && audioRef.current) {
            mediaSource = new MediaSourceAppender(type);
            pauseGlobalAudio();
            audioRef.current.src = mediaSource.mediaSourceUrl;
            try {
              // attempt to begin playback as soon as data becomes available
              if (!downloadFile) {
                await audioRef.current.play();
              }
            } catch (err) {
              console.error(err);
            }
          }

          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) {
              chunks.push(value);
              mediaSource?.addData(value);
            }
            done = readerDone;
          }

          mediaSource?.close();

          const audioBlob = new Blob(chunks, { type });

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

          if (!mediaSource) {
            await autoPlayAudio(blobUrl);
          }
        } else {
          const arrayBuffer = data as ArrayBuffer;
          const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

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
          await autoPlayAudio(blobUrl);
        }
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

  const generateSpeechExternal = (text: string, download: boolean) => {
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
      await playAudioPromise(blobUrl);
    }
  };

  const cancelSpeech = () => {
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    const pauseAudio = (currentElement: HTMLAudioElement | null) => {
      if (currentElement) {
        currentElement.pause();
        if (currentElement.src) {
          URL.revokeObjectURL(currentElement.src);
        }
        if (currentElement !== audioRef.current) {
          currentElement.src = '';
        }
      }
    };
    pauseAudio(messageAudio);
    pauseAudio(promiseAudioRef.current);
    setIsSpeaking(false);
  };

  const cancelPromiseSpeech = useCallback(() => {
    if (promiseAudioRef.current) {
      promiseAudioRef.current.pause();
      if (promiseAudioRef.current.src) {
        URL.revokeObjectURL(promiseAudioRef.current.src);
      }
      promiseAudioRef.current.src = '';
      setIsSpeaking(false);
    }
  }, [setIsSpeaking]);

  useEffect(() => {
    return cancelPromiseSpeech;
  }, [cancelPromiseSpeech]);

  const isFetching = useMemo(
    () => isLast && globalIsFetching && !globalIsPlaying,
    [globalIsFetching, globalIsPlaying, isLast],
  );

  const { data: voicesData = [] } = useVoicesQuery();

  return {
    generateSpeechExternal,
    cancelSpeech,
    isLoading: isFetching || isLoading,
    audioRef,
    voices: voicesData,
  };
}

export default useTextToSpeechExternal;
