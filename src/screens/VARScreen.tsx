import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { startCamera, getObject, loadMediaPipe } from '../lib/mediapipe';
import { showToast } from '../components/Toast';
import type { GoalResult } from '../state';

/**
 * VAR — Goal-line camera
 *
 * Place phone behind the goal line, facing the goal mouth.
 * Watches for the ball crossing the goal line. When detected:
 *   - "GOAL!" alert (yellow flashing)
 *   - Slow-mo replay
 *   - Auto-screenshot for the record
 */
export function VARScreen() {
  const { dispatch, state } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [lastResult, setLastResult] = useState<GoalResult | null>(null);
  const [goalLineY, setGoalLineY] = useState(0.5); // 0-1 vertical position of goal line

  const startCamera_ = async () => {
    try {
      await loadMediaPipe();
      const cam = await startCamera({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = cam.stream;
        videoRef.current.play();
      }
      setCameraOn(true);
      dispatch({ type: 'SET_CAMERA_READY', ready: true });
      dispatch({ type: 'SET_CAMERA_ERROR', error: null });
      runDetection(cam);
    } catch (err: any) {
      console.error(err);
      dispatch({ type: 'SET_CAMERA_ERROR', error: err.message || 'Camera unavailable' });
      showToast('Camera permission denied or unavailable', 'error');
    }
  };

  const runDetection = (cam: Awaited<ReturnType<typeof startCamera>>) => {
    if (!videoRef.current || !canvasRef.current) return;
    setDetecting(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let goalCooldown = 0;
    let lastBall = { x: 0, y: 0, t: 0, velocity: 0 };

    const tick = () => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Run MediaPipe Object Detection for the ball
      let detections: any[] = [];
      try {
        const result = getObject().detectForVideo(video, performance.now());
        detections = result.detections || [];
      } catch (e) {
        // Continue without detection
      }

      // Find the ball (highest scoring "Sports ball" or "Ball" class)
      const ball = detections
        .map((d: any) => {
          const cat = d.categories?.[0];
          return {
            cat: cat?.categoryName || '',
            score: cat?.score || 0,
            box: d.boundingBox,
            cx: (d.boundingBox?.originX || 0) + (d.boundingBox?.width || 0) / 2,
            cy: (d.boundingBox?.originY || 0) + (d.boundingBox?.height || 0) / 2
          };
        })
        .filter((d: any) => /ball|sport/i.test(d.cat))
        .sort((a: any, b: any) => b.score - a.score)[0];

      // Draw goal line overlay
      const goalLineYPx = canvas.height * goalLineY;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(0, goalLineYPx);
      ctx.lineTo(canvas.width, goalLineYPx);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('GOAL LINE', 16, goalLineYPx - 8);

      // Draw ball tracking
      if (ball) {
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(ball.box.originX, ball.box.originY, ball.box.width, ball.box.height);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.95)';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(`${(ball.score * 100).toFixed(0)}% ${ball.cat}`, ball.box.originX, ball.box.originY - 8);

        // Track velocity (frame-to-frame pixel movement)
        const now = performance.now();
        if (lastBall.t > 0) {
          const dt = (now - lastBall.t) / 1000;
          if (dt > 0) {
            const dx = ball.cx - lastBall.x;
            const dy = ball.cy - lastBall.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            lastBall.velocity = dist / dt; // px/s
          }
        }
        lastBall = { x: ball.cx, y: ball.cy, t: now, velocity: lastBall.velocity };

        // Check if ball crossed the goal line going down (into goal)
        if (goalCooldown <= 0 && lastBall.velocity > 50) {
          const ballJustAboveLine = lastBall.y < goalLineYPx - 5;
          const ballNowAtLine = ball.cy >= goalLineYPx;
          if (ballJustAboveLine && ballNowAtLine) {
            triggerGoal(ball);
            goalCooldown = 60; // ~2s cooldown at 30fps
          }
        }
      }
      if (goalCooldown > 0) goalCooldown--;

      // HUD
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`VAR MODE · ${Math.round(ball?.score * 100 || 0)}% confidence`, 16, 28);
      ctx.fillText(`Goal line: ${(goalLineY * 100).toFixed(0)}%`, 16, canvas.height - 16);

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const triggerGoal = (ball: any) => {
    const isGoal = ball.score > 0.5;
    const result: GoalResult = {
      isGoal,
      confidence: ball.score,
      ballVisible: true,
      ballOverLine: true,
      ts: Date.now()
    };
    setLastResult(result);
    dispatch({ type: 'ADD_RESULT', mode: 'var', result });
    if (isGoal) {
      showToast('⚽ GOAL! ⚽', 'success', 4000);
      // Visual celebration — flash
      flashScreen();
    } else {
      showToast('Ball crossed line (low confidence)', 'warn');
    }
  };

  const flashScreen = () => {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;background:#ffd700;z-index:9999;pointer-events:none;animation:flashfade 1s;';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1000);
  };

  return (
    <div className="screen var-screen">
      <h1 className="screen-title">VAR Review</h1>
      <p className="screen-subtitle">Phone on the goal line, facing the goal mouth. AI detects when the ball crosses the line.</p>

      <div className="var-camera-area">
        <video
          ref={videoRef}
          playsInline
          muted
          className="var-video"
          style={{ display: cameraOn ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="var-canvas" style={{ display: cameraOn ? 'block' : 'none' }} />

        {!cameraOn && (
          <div className="camera-placeholder">
            <div className="placeholder-icon">📺</div>
            <p className="placeholder-text">Camera off</p>
            <button className="btn btn-primary" onClick={startCamera_}>
              Start Camera
            </button>
          </div>
        )}

        {cameraOn && (
          <div className="goal-line-controls">
            <label>Goal line position</label>
            <input
              type="range"
              min="10"
              max="90"
              value={goalLineY * 100}
              onChange={e => setGoalLineY(parseInt(e.target.value) / 100)}
            />
            <span className="text-dim">{Math.round(goalLineY * 100)}%</span>
          </div>
        )}
      </div>

      {lastResult && (
        <div className={`var-result-banner ${lastResult.isGoal ? 'goal' : 'no-goal'}`}>
          <div className="result-icon">{lastResult.isGoal ? '⚽' : '✋'}</div>
          <div className="result-text">
            <div className="result-title">{lastResult.isGoal ? 'GOAL!' : 'NO GOAL'}</div>
            <div className="result-confidence">
              Confidence: {Math.round(lastResult.confidence * 100)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
