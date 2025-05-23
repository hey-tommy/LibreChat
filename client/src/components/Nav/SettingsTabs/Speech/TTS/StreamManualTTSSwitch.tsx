import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export const SHOW_STREAM_MANUAL_TTS_TOGGLE = false;

export default function StreamManualTTSSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [streamManualTTS, setStreamManualTTS] = useRecoilState<boolean>(store.streamManualTTS);
  const [textToSpeech] = useRecoilState<boolean>(store.textToSpeech);

  if (!SHOW_STREAM_MANUAL_TTS_TOGGLE) {
    return null;
  }

  const handleCheckedChange = (value: boolean) => {
    setStreamManualTTS(value);
    onCheckedChange?.(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_stream_manual_tts')}</div>
      <Switch
        id="StreamManualTTS"
        checked={streamManualTTS}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="StreamManualTTS"
        disabled={!textToSpeech}
      />
    </div>
  );
}
