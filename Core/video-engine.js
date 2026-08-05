/**
 * AI Content Studio - Video Rendering Engine
 * -----------------------------------------
 * Composites a sequence of (image, audio, caption) clips into a
 * real .webm video entirely in the browser: a hidden <canvas> is
 * captured as a video track, dialogue audio is decoded and routed
 * through a MediaStreamDestination as the audio track, and both
 * are recorded together with MediaRecorder. No server, no external
 * video library — but this does rely on MediaRecorder + canvas
 * captureStream support, which is solid on desktop Chrome/Edge/
 * Firefox and inconsistent on iOS Safari; that limitation is
 * surfaced to the user rather than hidden.
 */

const VideoEngine = (() => {

  const WIDTH = 1280;
  const HEIGHT = 720;
  const FALLBACK_CLIP_MS = 3000; // used when a clip has no audio to time itself against

  function isSupported() {
    return typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      (typeof AudioContext !== "undefined" || typeof window.webkitAudioContext !== "undefined");
  }

  function pickMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    return candidates.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "video/webm";
  }

  async function dataUrlToArrayBuffer(dataUrl) {
    const res = await fetch(dataUrl);
    return res.arrayBuffer();
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function drawFrame(ctx, img, captionText) {
    ctx.fillStyle = "#0d1013";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (img) {
      // letterbox / cover fit
      const scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (WIDTH - drawW) / 2;
      const dy = (HEIGHT - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    if (captionText) {
      const boxHeight = 110;
      ctx.fillStyle = "rgba(13,16,19,0.72)";
      ctx.fillRect(0, HEIGHT - boxHeight, WIDTH, boxHeight);
      ctx.fillStyle = "#f4f6f8";
      ctx.font = "600 30px 'Sora', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      wrapText(ctx, captionText, WIDTH / 2, HEIGHT - boxHeight / 2, WIDTH - 80, 36);
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    const lines = [];
    words.forEach(word => {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
  }

  /**
   * clips: [{ imageDataUrl, audioDataUrl|null, captionText }]
   * onProgress(index, total)
   * returns: { dataUrl, durationMs, mimeType }
   */
  async function renderSceneVideo(clips, onProgress) {
    if (!isSupported()) {
      throw new Error("This browser doesn't support in-browser video rendering (needs MediaRecorder + canvas.captureStream). Try desktop Chrome or Edge.");
    }
    if (!clips || clips.length === 0) {
      throw new Error("No clips to render — add images to this scene's dialogue lines first.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    drawFrame(ctx, null, null);

    const canvasStream = canvas.captureStream(30);
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const destination = audioCtx.createMediaStreamDestination();

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();

    const startedAt = performance.now();

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const img = clip.imageDataUrl ? await loadImage(clip.imageDataUrl) : null;
      drawFrame(ctx, img, clip.captionText);

      if (clip.audioDataUrl) {
        const arrayBuffer = await dataUrlToArrayBuffer(clip.audioDataUrl);
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(destination);
        source.connect(audioCtx.destination); // also let the user hear it live while rendering
        source.start();
        await new Promise(resolve => { source.onended = resolve; });
      } else {
        await new Promise(resolve => setTimeout(resolve, FALLBACK_CLIP_MS));
      }

      if (typeof onProgress === "function") onProgress(i + 1, clips.length);
    }

    recorder.stop();
    await stopped;
    audioCtx.close();

    const durationMs = Math.round(performance.now() - startedAt);
    const blob = new Blob(chunks, { type: mimeType });
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, durationMs, mimeType };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  return { isSupported, renderSceneVideo, WIDTH, HEIGHT };

})();

window.VideoEngine = VideoEngine;
