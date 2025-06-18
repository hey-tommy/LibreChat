import { atom } from 'recoil';

export type TTSAudioRequest = {
  messageId: string;
  runId?: string | null;
  index?: number;
  voice?: string;
};

export const ttsRequestAtom = atom<TTSAudioRequest | null>({
  key: 'ttsRequest',
  default: null,
});

export const activeAudioMessageIdAtom = atom<string | null>({
  key: 'activeAudioMessageId',
  default: null,
});

export default { ttsRequestAtom, activeAudioMessageIdAtom };
