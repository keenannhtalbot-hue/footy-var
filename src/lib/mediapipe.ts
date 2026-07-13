/**
 * MediaPipe manager — loads ONCE, shared across all modes
 * Three detectors:
 *  - Pose Landmarker: for body-camera kick speed (tracks foot/ankle)
 *  - Object Detector: for ball detection in line camera + goal detection in VAR
 *  - Hand Landmarker: (future) for goal-line gestures
 */

import { PoseLandmarker, ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

let poseInstance: PoseLandmarker | null = null;
let objectInstance: ObjectDetector | null = null;
let loadingPromise: Promise<void> | null = null;

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

export async function loadMediaPipe(): Promise<void> {
  if (poseInstance && objectInstance) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);

    // Pose Landmarker for body-camera kick tracking
    poseInstance = await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    // Object Detector for ball + goal detection
    // Try the latest official URL, fall back to alternatives if 404
    const modelUrls = [
      'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task',
      'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_int8.tflite'
    ];
    let lastErr: Error | null = null;
    for (const url of modelUrls) {
      try {
        objectInstance = await ObjectDetector.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: url,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          scoreThreshold: 0.4
        });
        break;
      } catch (e: any) {
        lastErr = e;
        console.warn(`Object detector model failed: ${url}`, e.message);
      }
    }
    if (!objectInstance) throw lastErr || new Error('No object detector model loaded');
  })();

  return loadingPromise;
}

export function getPose(): PoseLandmarker {
  if (!poseInstance) throw new Error('MediaPipe Pose not loaded yet. Call loadMediaPipe() first.');
  return poseInstance;
}

export function getObject(): ObjectDetector {
  if (!objectInstance) throw new Error('MediaPipe Object not loaded yet. Call loadMediaPipe() first.');
  return objectInstance;
}

/**
 * Camera manager — single shared camera stream
 * Modes can subscribe to frames via onFrame callback
 */

export interface CameraHandle {
  video: HTMLVideoElement;
  stream: MediaStream;
  stop: () => void;
  width: number;
  height: number;
  fps: number;
  onFrame: (cb: (video: HTMLVideoElement, ts: number) => void) => () => void;
}

export async function startCamera(constraints?: MediaStreamConstraints): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints ?? {
    video: {
      facingMode: { ideal: 'environment' },  // back camera on phones
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    },
    audio: false
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.muted = true;
  await video.play();

  // Track FPS
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fps = 30;
  let frameCallbacks: Array<(video: HTMLVideoElement, ts: number) => void> = [];
  let rafId: number | null = null;

  const tick = (ts: number) => {
    frameCount++;
    if (ts - lastFpsTime > 1000) {
      fps = Math.round((frameCount * 1000) / (ts - lastFpsTime));
      frameCount = 0;
      lastFpsTime = ts;
    }
    for (const cb of frameCallbacks) {
      try { cb(video, ts); } catch (e) { console.error('frame callback error:', e); }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    video,
    stream,
    width: video.videoWidth,
    height: video.videoHeight,
    get fps() { return fps; },
    onFrame(cb) {
      frameCallbacks.push(cb);
      return () => {
        frameCallbacks = frameCallbacks.filter(f => f !== cb);
      };
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      stream.getTracks().forEach(t => t.stop());
      video.pause();
      video.srcObject = null;
    }
  };
}
