import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { startCamera, getObject, loadMediaPipe } from '../lib/mediapipe';
import { showToast } from '../components/Toast';
import { formatSpeed, speedContext } from '../state';
import type { SpeedResult } from '../state';

/**
 * Ball Speed (line camera)
 *
 * Place phone perpendicular to kick direction, ~5m back, ~1m off the ground.
 * AI tracks ball, measures pixel-displacement per frame, converts to km/h
 * using a known reference (a standard ball is ~22cm diameter).
 */
export function BallSpeedScreen() {
  const { dispatch, state } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [lastSpeed, setLastSpeed] = useState<SpeedResult | null>(null);
  const [peak, setPeak] = useState(0);

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

  const runDetection = (cam: Awaited<ReturnType<typeof startCamera>>) => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let lastBalls: Array<{x: number, y: number, t: number, r: number}> = [];
    let currentPeak = 0;

    const tick = () => {
      if (!video.videoWidth) return requestAnimationFrame(tick);
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      let ball: any = null;
      try {
        const result = getObject().detectForVideo(video, performance.now());
        const detections = (result.detections || []) as any[];
        ball = detections
          .map((d: any) => {
            const cat = d.categories?.[0];
            return {
              cat: cat?.categoryName || '',
              score: cat?.score || 0,
              cx: (d.boundingBox?.originX || 0) + (d.boundingBox?.width || 0) / 2,
              cy: (d.boundingBox?.originY || 0) + (d.boundingBox?.height || 0) / 2,
              r: (d.boundingBox?.width || 0) / 2,
              t: performance.now()
            };
          })
          .filter((d: any) => /ball|sport/i.test(d.cat) && d.score > 0.4)
          .sort((a: any, b: any) => b.score - a.score)[0];
      } catch (e) { /* continue */ }

      if (ball) {
        // Draw ball tracker
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ball.cx, ball.cy, ball.r + 10, 0, Math.PI * 2);
        ctx.stroke();

        // Track past frames
        lastBalls.push(ball);
        if (lastBalls.length > 10) lastBalls.shift();

        // Compute speed using ball's known diameter (22cm = standard soccer ball)
        // pixels per meter = (ball.r * 2) / 0.22
        const pxPerMeter = ((ball as any).r * 2) / 0.22;
        if (pxPerMeter > 0 && lastBalls.length >= 2) {
          const recent = lastBalls[lastBalls.length - 1] as any;
          const old = lastBalls[0] as any;
          const dt = (recent.t - old.t) / 1000;
          if (dt > 0.05) { // skip if frames too close (avoid noise)
            const dx = recent.cx - old.cx;
            const dy = recent.cy - old.cy;
            const distM = Math.sqrt(dx*dx + dy*dy) / pxPerMeter;
            const ms = distM / dt;
            const kmh = ms * 3.6;
            if (kmh > 5 && kmh < 250 && kmh > currentPeak) {
              currentPeak = kmh;
            }
          }
        }

        // Show live speed HUD
        if (currentPeak > 0) {
          ctx.fillStyle = 'rgba(0, 212, 255, 0.95)';
          ctx.font = 'bold 18px monospace';
          ctx.fillText(`Peak: ${Math.round(currentPeak)} km/h`, 16, 28);
        }
      } else {
        // Reset peak when ball lost
        if (currentPeak > 0 && performance.now() - (lastBalls[lastBalls.length - 1]?.t || 0) > 1500) {
          if (currentPeak > 5) {
            const result: SpeedResult = {
              kmh: currentPeak,
              source: 'line',
              ts: Date.now()
            };
            setLastSpeed(result);
            setPeak(currentPeak);
            dispatch({ type: 'ADD_RESULT', mode: 'ball-speed', result });
            showToast(`Peak: ${formatSpeed(currentPeak, state.settings.unit)}`, 'success', 4000);
          }
          currentPeak = 0;
        }
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <div className="screen ball-speed-screen">
      <h1 className="screen-title">Ball Speed</h1>
      <p className="screen-subtitle">Phone propped perpendicular to the kick, ~5m back. Tracks ball crossing left-to-right.</p>

      <div className="ball-camera-area">
        <video ref={videoRef} playsInline muted className="ball-video" style={{ display: cameraOn ? 'block' : 'none' }} />
        <canvas ref={canvasRef} className="ball-canvas" style={{ display: cameraOn ? 'block' : 'none' }} />
        {!cameraOn && (
          <div className="camera-placeholder">
            <div className="placeholder-icon">⚽</div>
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
          <button className="btn btn-secondary" onClick={() => { setLastSpeed(null); setPeak(0); }}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
