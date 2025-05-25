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
  messageId?: string; // Used for unique ID for the audio element in TTS.tsx if needed
  isLast: boolean;
  index?: number;
};

function useTextToSpeechExternal({
  setIsSpeaking,
  audioRef,
  // messageId, // Not directly used in this hook's logic after refactor, but kept if parent needs it
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
  const [isProcessing, setIsProcessing] = useState(false); // Combined loading/streaming state

  const mediaSourceRef = useRef<MediaSourceAppender | null>(null);
  // Keep track of the current object URL (blob or MediaSource) to revoke it
  const currentObjectUrlRef = useRef<string | null>(null);

  // Refs for event handlers to ensure correct removal
  const canPlayHandlerRef = useRef<(() => void) | null>(null);
  const mediaLoadErrorHandlerRef = useRef<((event: Event) => void) | null>(null);


  /* Global Audio Variables for isLoading state calculation */
  const globalIsFetching = useRecoilValue(store.globalAudioFetchingFamily(index));
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const cleanupOldAudioSource = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
      // Important: Remove src attribute to allow new src to be loaded properly
      // and to stop the browser from potentially holding onto the old resource.
      audioRef.current.removeAttribute('src');
      audioRef.current.load(); // Resets the media element to its initial state.
    }
    if (mediaSourceRef.current) {
      mediaSourceRef.current.close(); // Ensure MediaSource is closed if it was used
      mediaSourceRef.current = null;
    }
     // Remove any lingering instance-specific listeners from audioRef.current
    if (audioRef.current && canPlayHandlerRef.current) {
      audioRef.current.removeEventListener('canplay', canPlayHandlerRef.current);
      canPlayHandlerRef.current = null;
    }
    if (audioRef.current && mediaLoadErrorHandlerRef.current) {
      audioRef.current.removeEventListener('error', mediaLoadErrorHandlerRef.current);
      mediaLoadErrorHandlerRef.current = null;
    }
  }, [audioRef]);


  const playAudioWithDomElement = useCallback((audioUrl: string) => {
    if (!audioRef.current) {
      console.error('Audio ref is not available for playback.');
      setIsSpeaking(false);
      setIsProcessing(false);
      return;
    }

    cleanupOldAudioSource(); // Clean up before setting a new source

    currentObjectUrlRef.current = audioUrl; // Store for later revocation

    if (playbackRate != null && playbackRate > 0) {
      audioRef.current.playbackRate = playbackRate;
    }

    const handleSuccessfulPlay = () => {
      setIsSpeaking(true);
      setIsProcessing(false); // Playback started, no longer "processing" in the sense of fetching/preparing
      if (audioRef.current && canPlayHandlerRef.current) {
        audioRef.current.removeEventListener('canplay', canPlayHandlerRef.current);
      }
      if (audioRef.current && mediaLoadErrorHandlerRef.current) {
        audioRef.current.removeEventListener('error', mediaLoadErrorHandlerRef.current);
      }
    };

    const handlePlayAttemptError = (error: Error) => {
      console.error('Error attempting to play audio:', error);
      setIsSpeaking(false);
      setIsProcessing(false);
      // Using existing localization key, providing more context in the error object for developers
      showToast({
        message: localize('com_nav_audio_play_error', { 0: error.message || 'Unknown playback error.' }),
        status: 'error',
      });
      cleanupOldAudioSource(); // Clean up if play fails
    };
    
    canPlayHandlerRef.current = () => {
      if(audioRef.current){
        audioRef.current.play().then(handleSuccessfulPlay).catch(handlePlayAttemptError);
      }
    };

    mediaLoadErrorHandlerRef.current = (event: Event) => {
      console.error('Error loading audio source:', event);
      setIsSpeaking(false);
      setIsProcessing(false);
      showToast({
        message: localize('com_nav_audio_play_error', { 0: 'Failed to load audio source.' }),
        status: 'error',
      });
      cleanupOldAudioSource();
    };
    
    if(audioRef.current) {
      audioRef.current.addEventListener('canplay', canPlayHandlerRef.current);
      audioRef.current.addEventListener('error', mediaLoadErrorHandlerRef.current);
      audioRef.current.src = audioUrl;
      audioRef.current.load(); // This signals the browser to load the new source
    }

  }, [audioRef, playbackRate, setIsSpeaking, showToast, localize, cleanupOldAudioSource]);


  const downloadAudio = (blobUrl: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'audio.mp3';
    document.body.appendChild(a); // Required for Firefox
    a.click();
    document.body.removeChild(a);
    // URL.revokeObjectURL(blobUrl); // blobUrl is revoked by playAudioWithDomElement or cancelSpeech
    setDownloadFile(false);
  };

  const { mutate: processAudioViaAxios, isLoading: isLoadingAxios } = useTextToSpeechMutation({
    onMutate: (variables) => {
      setIsProcessing(true);
      const inputText = (variables.get('input') ?? '') as string;
      if (inputText.length >= 4096) {
        showToast({ message: localize('com_nav_long_audio_warning'), status: 'warning' });
      }
    },
    onSuccess: async (data: ArrayBuffer, variables) => {
      try {
        const inputText = (variables.get('input') ?? '') as string;
        const audioBlob = new Blob([data], { type: 'audio/mpeg' });

        if (cacheTTS && inputText) {
          const cache = await caches.open('tts-responses');
          await cache.put(new Request(inputText), new Response(audioBlob));
        }

        const blobUrl = URL.createObjectURL(audioBlob);
        if (downloadFile) {
          downloadAudio(blobUrl); // Download happens, then we might play or not based on user flow
          // If !downloadFile, playAudioWithDomElement will be called next
        }
        // Playback is now handled by playAudioWithDomElement, called after this or by handleCachedResponse
        playAudioWithDomElement(blobUrl);
      } catch (error) {
        setIsProcessing(false);
        showToast({ message: `Error processing audio: ${(error as Error).message}`, status: 'error' });
      }
    },
    onError: (error: unknown) => {
      setIsProcessing(false);
      showToast({ message: localize('com_nav_audio_process_error', { 0: (error as Error).message }), status: 'error' });
    },
  });

  const startFullDownloadMutation = (text: string, shouldDownload: boolean) => {
    const formData = createFormData(text, voice ?? '');
    setDownloadFile(shouldDownload);
    processAudioViaAxios(formData);
  };

  const startStreamingWithFetch = async (text: string, shouldDownload: boolean) => {
    const formData = createFormData(text, voice ?? '');
    setDownloadFile(shouldDownload);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/files/speech/tts/manual', {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const type = 'audio/mpeg';
      const browserSupportsMediaSource = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
      const audioChunks: ArrayBuffer[] = [];
      
      mediaSourceRef.current = browserSupportsMediaSource ? new MediaSourceAppender(type) : null;

      if (mediaSourceRef.current) {
        playAudioWithDomElement(mediaSourceRef.current.mediaSourceUrl);
      }

      let doneReadingStream = false;
      while (!doneReadingStream) {
        const { value, done } = await reader.read();
        doneReadingStream = done;
        if (value) {
          const buffer = (value.buffer as ArrayBuffer).slice(value.byteOffset, value.byteOffset + value.byteLength);
          if (cacheTTS) {
            audioChunks.push(buffer);
          }
          if (mediaSourceRef.current) {
            mediaSourceRef.current.addData(buffer);
          }
        }
      }

      mediaSourceRef.current?.close(); // Signal end of stream to MediaSource

      if (audioChunks.length > 0) { // If we collected chunks (either for caching or no MediaSource)
        const audioBlob = new Blob(audioChunks, { type });
        if (cacheTTS && text) {
          const cache = await caches.open('tts-responses');
          await cache.put(new Request(text), new Response(audioBlob));
        }
        if (!browserSupportsMediaSource) { // If MediaSource wasn't supported, play the full blob
          const blobUrl = URL.createObjectURL(audioBlob);
          playAudioWithDomElement(blobUrl);
        }
        if (shouldDownload) { // Handle download regardless of MediaSource support, using the full blob
          const blobUrl = URL.createObjectURL(audioBlob); // Create a new one if mediaSource was used.
          downloadAudio(blobUrl);
        }
      }
      // If browserSupportsMediaSource and not downloading, playback was already initiated.
      // If chunks.length is 0 and not downloading (e.g. cacheTTS is false, MediaSource was used), nothing more to do for playback.

    } catch (error) {
      console.error('Error during streaming TTS:', error);
      showToast({ message: localize('com_nav_audio_process_error', { 0: (error as Error).message }), status: 'error' });
      setIsProcessing(false);
      cleanupOldAudioSource();
    }
    // setIsProcessing(false) is called in playAudioWithDomElement's success/error or here if an earlier error.
    // For streaming, successful playback means setIsProcessing(false) is called by playAudioWithDomElement.
    // If streaming itself fails before playAudioWithDomElement is fully engaged,setIsProcessing(false) here.
    // This might need adjustment if playAudioWithDomElement handles setIsProcessing(false) on its own errors too.
  };

  const generateSpeechExternal = async (text: string, shouldDownload: boolean) => {
    cleanupOldAudioSource(); // Clean up any previous state before starting a new operation
    setIsProcessing(true); // Set processing true at the beginning of any generation attempt

    if (cacheTTS) {
      const cachedResponse = await caches.match(text);
      if (cachedResponse) {
        try {
          const audioBlob = await cachedResponse.blob();
          const blobUrl = URL.createObjectURL(audioBlob);
          if (shouldDownload) {
            downloadAudio(blobUrl);
            setIsProcessing(false); // Download doesn't involve async play, so reset processing
          } else {
            playAudioWithDomElement(blobUrl); // playAudioWithDomElement will handle setIsProcessing
          }
          return;
        } catch(error) {
          console.error("Error handling cached response:", error);
          setIsProcessing(false);
          showToast({ message: localize('com_nav_audio_process_error', { 0: (error as Error).message }), status: 'error' });
        }
      }
    }

    if (streamManualTTS) {
      startStreamingWithFetch(text, shouldDownload);
    } else {
      startFullDownloadMutation(text, shouldDownload);
    }
  };

  const cancelSpeech = useCallback(() => {
    cleanupOldAudioSource();
    setIsSpeaking(false);
    setIsProcessing(false);
  }, [cleanupOldAudioSource, setIsSpeaking]);

  // Effect to clean up when the component unmounts or dependencies change significantly
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, [cancelSpeech]);

  const isLoadingCombined = useMemo(
    () => (isLast && globalIsFetching && !globalIsPlaying) || isLoadingAxios || isProcessing,
    [isLast, globalIsFetching, globalIsPlaying, isLoadingAxios, isProcessing],
  );

  const { data: voicesData = [] } = useVoicesQuery();

  return {
    generateSpeechExternal,
    cancelSpeech,
    isLoading: isLoadingCombined,
    audioRef, // This ref is now consistently used for playback
    voices: voicesData,
  };
}

export default useTextToSpeechExternal;