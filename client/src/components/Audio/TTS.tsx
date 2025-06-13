/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TMessageAudio } from '~/common';
import { useLocalize, useTTSBrowser } from '~/hooks';
import { v4 as uuid } from 'uuid';
import audioStore from '~/store/audio';
import { usePauseGlobalAudio } from '~/hooks/Audio';
import { VolumeIcon, VolumeMuteIcon, Spinner } from '~/components';
import { logger } from '~/utils';
import store from '~/store';

export function BrowserTTS({ isLast, index, messageId, content, className }: TMessageAudio) {
  const localize = useLocalize();
  const playbackRate = useRecoilValue(store.playbackRate);

  const { toggleSpeech, isSpeaking, isLoading, audioRef } = useTTSBrowser({
    isLast,
    index,
    messageId,
    content,
  });

  const renderIcon = (size: string) => {
    if (isLoading === true) {
      return <Spinner size={size} />;
    }

    if (isSpeaking === true) {
      return <VolumeMuteIcon size={size} />;
    }

    return <VolumeIcon size={size} />;
  };

  return (
    <>
      <button
        className={className}
        onClickCapture={() => {
          if (audioRef.current) {
            audioRef.current.muted = false;
          }
          toggleSpeech();
        }}
        type="button"
        title={isSpeaking === true ? localize('com_ui_stop') : localize('com_ui_read_aloud')}
      >
        {renderIcon('19')}
      </button>
      <audio
        ref={audioRef}
        controls
        preload="none"
        controlsList="nodownload nofullscreen noremoteplayback"
        style={{
          position: 'absolute',
          overflow: 'hidden',
          display: 'none',
          height: '0px',
          width: '0px',
        }}
        src={audioRef.current?.src}
        onError={(error) => {
          logger.error('Error fetching audio:', error);
        }}
        id={`audio-${messageId}`}
        autoPlay
      />
    </>
  );
}

export function ExternalTTS({ isLast, index, messageId, className }: TMessageAudio) {
  const localize = useLocalize();
  const setTtsRequest = useSetRecoilState(audioStore.ttsRequestAtom);
  const isLoading = useRecoilValue(store.globalAudioFetchingFamily(index));
  const isSpeaking = useRecoilValue(store.globalAudioPlayingFamily(index)) && isLast;
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);

  const toggleSpeech = () => {
    if (isSpeaking) {
      pauseGlobalAudio();
    } else if (messageId) {
      setTtsRequest({ messageId, runId: uuid(), index });
    }
  };

  const renderIcon = (size: string) => {
    if (isLoading === true) {
      return <Spinner size={size} />;
    }

    if (isSpeaking === true) {
      return <VolumeMuteIcon size={size} />;
    }

    return <VolumeIcon size={size} />;
  };

  return (
    <button
      className={className}
      onClick={toggleSpeech}
      type="button"
      title={isSpeaking === true ? localize('com_ui_stop') : localize('com_ui_read_aloud')}
    >
      {renderIcon('19')}
    </button>
  );
}
