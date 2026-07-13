import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { startCamera, getPose, loadMediaPipe } from '../lib/mediapipe';
import { showToast } from '../components/Toast';
import { formatSpeed, speedContext } from '../state';
import type { SpeedResult } from '../state';

/**
 * Kick Speed (body camera)
 *
 * Phone facing the kicker from the side, ~3m away.
 * AI tracks the kicking ankle using pose landmarks, computes foot velocity.
 */
export function KickSpeedScreen() {
  const { dispatch, state } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [lastSpeed, setLastSpeed] = useState<SpeedResult | null>(null);

  const startCamera_ = async () => {
    try {
      await loadMediaPipe();
      const cam = await startCamera({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = cam.stream;
        videoRef.current.play();
      }
      setCameraOn(true);
      dispatch({ type: 'SET_CAMERA_ERROR', error: null });
      runDetection(cam);
    } catch (err: any) {
      dispatch({ type: 'SET_CAMERA_ERROR', error: err.message });
      showToast('Camera unavailable', 'error');
    }
  };

  // Pose landmark indices (MediaPipe Pose 33-point model)
  // https://google.github.io/mediapipe/solutions/pose.html
  const LANDMARKS = {
    leftAnkle: 27, rightAnkle: 28,
    leftKnee: 25, rightKnee: 26,
    leftHip: 23, rightHip: 24,
    nose: 0, leftShoulder: 11, rightShoulder: 12
  };

  const runDetection = (cam: Awaited<ReturnType<typeof startCamera>>) => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let lastAnkle: { x: number, y: number, t: number, visible: boolean } | null = null;
    let peakSpeed = 0;
    let lastVisibleFrame = 0;

    const tick = () => {
      if (!video.videoWidth) return requestAnimationFrame(tick);
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      let landmarks: any[] = [];
      try {
        const result = getPose().detectForVideo(video, performance.now());
        landmarks = result.landmarks?.[0] || [];
      } catch (e) { /* continue */ }

      if (landmarks.length > 0) {
        // Detect which ankle is moving (compare to previous frame)
        const lAnkle = landmarks[LANDMARKS.leftAnkle];
        const rAnkle = landmarks[LANDMARKS.rightAnkle];

        // Use whichever ankle has higher visibility OR higher movement
        let chosen = rAnkle;
        if (lAnkle && rAnkle) {
          chosen = lAnkle.visibility > rAnkle.visibility ? lAnkle : rAnkle;
        } else if (lAnkle) {
          chosen = lAnkle;
        }

        const now = performance.now();
        const visible = chosen && chosen.visibility > 0.5;

        if (visible && chosen) {
          // Draw skeleton overlay
          drawSkeleton(ctx, landmarks, canvas.width, canvas.height);

          // Highlight ankle
          const ax = chosen.x * canvas.width;
          const ay = chosen.y * canvas.height;
          ctx.strokeStyle = '#ff6b35';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(ax, ay, 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 107, 53, 0.95)';
          ctx.font = 'bold 14px monospace';
          ctx.fillText('🦴', ax - 8, ay + 5);

          // Compute speed: assume kicker is ~1m tall (head to ankle ratio)
          // Pixel ratio: head.y - ankle.y ≈ 1m of body height
          if (landmarks[LANDMARKS.nose]) {
            const head = landmarks[LANDMARKS.nose];
            const bodyHeightPx = Math.abs(head.y - chosen.y) * canvas.height;
            if (bodyHeightPx > 100) { // sanity check - body visible
              const pxPerMeter = bodyHeightPx / 1.0;
              if (lastAnkle && lastAnkle.visible) {
                const dt = (now - lastAnkle.t) / 1000;
                if (dt > 0.02 && dt < 0.2) {
                  const dx = (chosen.x - lastAnkle.x) * canvas.width;
                  const dy = (chosen.y - lastAnkle.y) * canvas.height;
                  const distM = Math.sqrt(dx*dx + dy*dy) / pxPerMeter;
                  const ms = distM / dt;
                  const kmh = ms * 3.6;
                  // Real kicks are 30-130 km/h, filter noise
                  if (kmh > 5 && kmh < 200 && kmh > peakSpeed) {
                    peakSpeed = kmh;
                  }
                  // Show live speed
                  if (kmh > 5) {
                    ctx.fillStyle = 'rgba(255, 107, 53, 0.95)';
                    ctx.font = 'bold 24px monospace';
                    ctx.fillText(`${Math.round(kmh)} km/h`, 16, 40);
                  }
                }
              }
              lastAnkle = { x: chosen.x, y: chosen.y, t: now, visible: true };
              lastVisibleFrame = now;
            }
          }
        } else {
          lastAnkle = null;
        }

        // If ankle lost for >1s, save peak as result
        if (peakSpeed > 5 && performance.now() - lastVisibleFrame > 1000 && lastAnkle === null) {
          const result: SpeedResult = {
            kmh: peakSpeed,
            source: 'body',
            ts: Date.now()
          };
          setLastSpeed(result);
          dispatch({ type: 'ADD_RESULT', mode: 'kick-speed', result });
          showToast(`Kick: ${formatSpeed(peakSpeed, state.settings.unit)}`, 'success', 4000);
          peakSpeed = 0;
          lastAnkle = null;
        }
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('Position kicker in frame', 16, 28);
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const drawSkeleton = (ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number) => {
    const connections = [
      [11, 12], [11, 23], [12, 24], [23, 24], // shoulders to hips
      [11, 13], [13, 15], [12, 14], [14, 16], // arms
      [23, 25], [25, 27], [24, 26], [26, 28]  // legs
    ];
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.lineWidth = 3;
    for (const [a, b] of connections) {
      if (landmarks[a] && landmarks[b]) {
        ctx.beginPath();
        ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
        ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
        ctx.stroke();
      }
    }
  };

  return (
    <div className="screen kick-speed-screen">
      <h1 className="screen-title">Kick Speed</h1>
      <p className="screen-subtitle">Face the kicker from the side, ~3m away. AI tracks the foot.</p>

      <div className="kick-camera-area">
        <video ref={videoRef} playsInline muted className="kick-video" style={{ display: cameraOn ? 'block' : 'none' }} />
        <canvas ref={canvasRef} className="kick-canvas" style={{ display: cameraOn ? 'block' : 'none' }} />
        {!cameraOn && (
          <div className="camera-placeholder">
            <div className="placeholder-icon">🦵</div>
            <p className="placeholder-text">Camera off</p>
            <button className="btn btn-primary" onClick={startCamera_}>Start Camera</button>
          </div>
        )}
      </div>

      {lastSpeed && (
        <div className="speed-result card">
          <div className="speed-display">
            <div className="speed-num" style={{ color: speedContext(lastSpeed.kmh).color }}>
              {formatSpeed(lastSpeed.kmh, state.settings.unit)}
            </div>
            <div className="speed-label">{speedContext(lastSpeed.kmh).label}</div>
          </div>
          <button className="btn btn-secondary" onClick={() => setLastSpeed(null)}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
