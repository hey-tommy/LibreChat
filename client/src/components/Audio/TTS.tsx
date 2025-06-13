/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TMessageAudio } from '~/common';
import { useLocalize, useTTSBrowser } from '~/hooks';
import { usePauseGlobalAudio } from '~/hooks/Audio';
import { ttsRequestAtom } from '~/store/audio';
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

  useEffect(() => {
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    if (!messageAudio) {
      return;
    }
    if (playbackRate != null && playbackRate > 0 && messageAudio.playbackRate !== playbackRate) {
      messageAudio.playbackRate = playbackRate;
    }
  }, [audioRef, isSpeaking, playbackRate, messageId]);

  logger.log(
    'MessageAudio: audioRef.current?.src, audioRef.current',
    audioRef.current?.src,
    audioRef.current,
  );

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
  const setRequest = useSetRecoilState(ttsRequestAtom);
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const isSpeaking = useRecoilValue(store.globalAudioPlayingFamily(index));
  const isLoading = useRecoilValue(store.globalAudioFetchingFamily(index));
  const activeRunId = useRecoilValue(store.activeRunFamily(index));

  const renderIcon = (size: string) => {
    if (isLoading === true) {
      return <Spinner size={size} />;
    }

    if (isSpeaking === true) {
      return <VolumeMuteIcon size={size} />;
    }

    return <VolumeIcon size={size} />;
  };

  const handleClick = () => {
    if (isSpeaking) {
      pauseGlobalAudio();
      setRequest(null);
    } else if (messageId) {
      setRequest({ messageId, runId: activeRunId, index });
    }
  };

  return (
    <button
      className={className}
      onClick={handleClick}
      type="button"
      title={isSpeaking === true ? localize('com_ui_stop') : localize('com_ui_read_aloud')}
    >
      {renderIcon('19')}
    </button>
  );
}
