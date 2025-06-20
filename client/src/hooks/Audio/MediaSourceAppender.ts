export class MediaSourceAppender {
  private readonly mediaSource = new MediaSource();
  private readonly audioChunks: ArrayBuffer[] = [];

  private sourceBuffer?: SourceBuffer;
  private processingPromise: Promise<void>;
  private resolveProcessing?: () => void;

  constructor(type: string) {
    this.processingPromise = new Promise((resolve) => {
      this.resolveProcessing = resolve;
    });

    this.mediaSource.addEventListener('sourceopen', async () => {
      this.sourceBuffer = this.mediaSource.addSourceBuffer(type);

      this.sourceBuffer.addEventListener('updateend', () => {
        this.tryAppendNextChunk();
      });

      this.tryAppendNextChunk();
    });
  }

  private tryAppendNextChunk() {
    if (this.sourceBuffer != null && !this.sourceBuffer.updating && this.audioChunks.length > 0) {
      this.sourceBuffer.appendBuffer(this.audioChunks.shift()!);
    } else if (
      this.sourceBuffer != null &&
      !this.sourceBuffer.updating &&
      this.audioChunks.length === 0
    ) {
      // If the queue is empty and we are not updating, resolve the promise.
      this.resolveProcessing?.();
    }
  }

  public addBase64Data(base64Data: string) {
    this.addData(Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0)).buffer);
  }

  public addData(data: ArrayBuffer) {
    this.audioChunks.push(data);
    this.tryAppendNextChunk();
  }

  public awaitProcessing() {
    return this.processingPromise;
  }

  public close() {
    if (this.mediaSource.readyState === 'open' && !this.sourceBuffer?.updating) {
      this.mediaSource.endOfStream();
    }
  }

  public get mediaSourceUrl() {
    return URL.createObjectURL(this.mediaSource);
  }
}
