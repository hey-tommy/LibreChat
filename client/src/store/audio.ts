import { atom } from 'recoil';

export type TTSAudioRequest = {
  messageId: string;
  text?: string;
  runId?: string | null;
  index?: number;
  voice?: string;
};

export const ttsRequestAtom = atom<TTSAudioRequest | null>({
  key: 'ttsRequest',
  default: null,
});

export default { ttsRequestAtom };
