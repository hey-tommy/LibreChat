import { atom } from 'recoil';

export type TTSAudioRequest = {
  text?: string;
  messageId?: string;
  runId?: string;
};

export const ttsRequestAtom = atom<TTSAudioRequest | null>({
  key: 'ttsRequest',
  default: null,
});

export default { ttsRequest: ttsRequestAtom };
