import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { startCamera, getObject, loadMediaPipe } from '../lib/mediapipe';
import { showToast } from '../components/Toast';
import type { PenaltyResult } from '../state';

/**
 * Penalty Shootout
 *
 * Goal behind, kicker in front. Camera looks at the goal mouth.
 * Place the ball on the penalty spot, kick it. AI:
 *   - Detects ball direction
 *   - AI goalkeeper dives randomly (left/center/right)
 *   - If ball direction ≠ goalkeeper dive → GOAL
 *   - VAR review after each shot
 *   - 5 shots total, scoreboard
 */
export function PenaltyScreen() {
  const { dispatch, state } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [result, setResult] = useState<PenaltyResult>({
    score: { team: 0, opponent: 0 },
    shots: 0,
    lastResult: null,
    ballPosition: { x: 0.5, y: 0.5 },
    keeperDive: null
  });
  const [phase, setPhase] = useState<'ready' | 'live' | 'review'>('ready');
  const [phaseStartTs, setPhaseStartTs] = useState(0);

  const startPenalty = async () => {
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
      setPhase('ready');
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
              cx: ((d.boundingBox?.originX || 0) + (d.boundingBox?.width || 0) / 2) / video.videoWidth,
              cy: ((d.boundingBox?.originY || 0) + (d.boundingBox?.height || 0) / 2) / video.videoHeight,
              size: (d.boundingBox?.width || 0) / video.videoWidth
            };
          })
          .filter((d: any) => /ball|sport/i.test(d.cat) && d.score > 0.4)
          .sort((a: any, b: any) => b.score - a.score)[0];
      } catch (e) { /* continue */ }

      if (ball) {
        // Draw ball tracker
        const px = ball.cx * canvas.width;
        const py = ball.cy * canvas.height;
        const pr = ball.size * canvas.width / 2;
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, pr + 10, 0, Math.PI * 2);
        ctx.stroke();

        // Detect shot fired (ball moved significantly toward goal)
        if (phase === 'live' && ball.cy < 0.4) {
          // Ball is in upper portion = goal area
          determineShotResult(ball.cx);
          setPhase('review');
        }

        // Update position display
        setResult(prev => ({ ...prev, ballPosition: { x: ball.cx, y: ball.cy } }));
      }

      // Draw goal frame overlay
      drawGoalOverlay(ctx, canvas.width, canvas.height, result);

      // HUD
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${result.score.team} - ${result.score.opponent}`, canvas.width / 2 - 30, 40);
      ctx.font = '12px sans-serif';
      ctx.fillText(`Shot ${result.shots + 1}/5`, canvas.width / 2 - 25, 60);

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const drawGoalOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, r: PenaltyResult) => {
    // Draw goal frame (top half of screen)
    const goalTop = h * 0.2;
    const goalBottom = h * 0.45;
    const postWidth = w * 0.08;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    // Left post
    ctx.moveTo(0, goalTop);
    ctx.lineTo(0, goalBottom);
    // Right post
    ctx.moveTo(w, goalTop);
    ctx.lineTo(w, goalBottom);
    // Crossbar
    ctx.moveTo(0, goalTop);
    ctx.lineTo(w, goalTop);
    // Ground line
    ctx.moveTo(0, goalBottom);
    ctx.lineTo(w, goalBottom);
    ctx.stroke();

    // Net (subtle crosshatch)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let x = postWidth; x < w - postWidth; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, goalTop);
      ctx.lineTo(x, goalBottom);
      ctx.stroke();
    }
    for (let y = goalTop; y < goalBottom; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Goalkeeper position
    const keeperY = goalBottom - 20;
    const sectionWidth = w / 3;
    let keeperX = w / 2;
    if (r.keeperDive === 'left') keeperX = sectionWidth / 2;
    else if (r.keeperDive === 'right') keeperX = w - sectionWidth / 2;

    if (phase === 'live' || phase === 'review') {
      ctx.fillStyle = 'rgba(255, 107, 53, 0.85)';
      ctx.beginPath();
      ctx.arc(keeperX, keeperY, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('GK', keeperX - 8, keeperY + 4);
    }

    // Result overlay
    if (phase === 'review' && r.lastResult) {
      ctx.fillStyle = r.lastResult === 'goal' ? 'rgba(255, 215, 0, 0.85)' : 'rgba(255, 56, 56, 0.85)';
      ctx.font = 'bold 64px sans-serif';
      const text = r.lastResult === 'goal' ? 'GOAL!' : r.lastResult === 'save' ? 'SAVED' : 'MISS';
      ctx.fillText(text, w / 2 - ctx.measureText(text).width / 2, h / 2);
    }
  };

  const fireShot = () => {
    if (phase !== 'ready' || result.shots >= 5) return;
    // AI goalie dives randomly
    const dives: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const keeperDive = dives[Math.floor(Math.random() * 3)];
    setResult(prev => ({ ...prev, keeperDive, shots: prev.shots + 1 }));
    setPhase('live');
    setPhaseStartTs(performance.now());
    showToast('KICK! 🎯', 'info', 1500);
  };

  const determineShotResult = (ballFinalX: number) => {
    // Divide goal into 3 sections
    const section = ballFinalX < 0.33 ? 'left' : ballFinalX > 0.66 ? 'right' : 'center';
    const keeperDive = result.keeperDive;

    let shotResult: 'goal' | 'save' | 'miss';
    if (section === keeperDive) {
      // Keeper guessed right
      shotResult = ballFinalX > 0.85 || ballFinalX < 0.15 ? 'miss' : 'save';
    } else {
      shotResult = 'goal';
    }

    setResult(prev => {
      const next = { ...prev, lastResult: shotResult };
      if (shotResult === 'goal') {
        next.score = { ...prev.score, team: prev.score.team + 1 };
      } else if (shotResult === 'save' || shotResult === 'miss') {
        next.score = { ...prev.score, opponent: prev.score.opponent + 1 };
      }
      return next;
    });

    showToast(shotResult.toUpperCase(), shotResult === 'goal' ? 'success' : 'warn');

    // Auto-advance to next shot after 3s
    setTimeout(() => {
      if (result.shots + 1 >= 5) {
        // Match over
        setTimeout(() => showMatchResult(), 1000);
      } else {
        setPhase('ready');
        setResult(prev => ({ ...prev, lastResult: null, keeperDive: null }));
      }
    }, 3000);
  };

  const showMatchResult = () => {
    const { team, opponent } = result.score;
    let msg = '';
    if (team > opponent) msg = `🏆 You win ${team}-${opponent}!`;
    else if (team < opponent) msg = `😞 Lost ${team}-${opponent}`;
    else msg = `🤝 Drew ${team}-${opponent}`;
    showToast(msg, team > opponent ? 'success' : 'info', 6000);
  };

  const reset = () => {
    setResult({ score: { team: 0, opponent: 0 }, shots: 0, lastResult: null, ballPosition: { x: 0.5, y: 0.5 }, keeperDive: null });
    setPhase('ready');
  };

  return (
    <div className="screen penalty-screen">
      <div className="penalty-header">
        <div>
          <h1 className="screen-title">Penalty Shootout</h1>
          <p className="screen-subtitle">Aim and shoot — the AI goalkeeper will try to save.</p>
        </div>
        <button className="btn btn-secondary" onClick={reset}>Reset</button>
      </div>

      <div className="penalty-camera-area">
        <video ref={videoRef} playsInline muted className="penalty-video" style={{ display: cameraOn ? 'block' : 'none' }} />
        <canvas ref={canvasRef} className="penalty-canvas" style={{ display: cameraOn ? 'block' : 'none' }} />
        {!cameraOn && (
          <div className="camera-placeholder">
            <div className="placeholder-icon">🥅</div>
            <p className="placeholder-text">Camera off</p>
            <button className="btn btn-primary" onClick={startPenalty}>Start Shootout</button>
          </div>
        )}
      </div>

      {cameraOn && phase === 'ready' && result.shots < 5 && (
        <button className="btn btn-primary fire-btn" onClick={fireShot}>
          🥅 KICK!
        </button>
      )}

      {result.shots >= 5 && phase === 'review' && (
        <div className="match-over card">
          <h2>Match Over</h2>
          <div className="final-score">{result.score.team} - {result.score.opponent}</div>
          <button className="btn btn-primary" onClick={reset}>Play Again</button>
        </div>
      )}
    </div>
  );
}
