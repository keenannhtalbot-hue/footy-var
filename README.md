# FootyVAR — Sideline Referee

A PWA for sideline soccer — goal-line VAR review, ball speed tracking, kick speed detection, and penalty shootouts. Built with React + TypeScript + MediaPipe.

## Modes

### 📺 VAR Review
Prop your phone behind the goal line facing the goal mouth. AI detects when the ball crosses the line. Yellow flashing alert + "GOAL!" toast.

### ⚽ Ball Speed (line camera)
Phone propped perpendicular to the kick direction, ~5m back. AI tracks the ball, computes km/h from pixel displacement over time using the standard 22cm ball diameter as a reference.

### 🦵 Kick Speed (body camera)
Face the kicker from the side, ~3m away. MediaPipe Pose tracks the kicking ankle, computes peak foot velocity.

### 🥅 Penalty Shootout
5-shot shootout with an AI goalkeeper that dives randomly. VAR review overlay shows the result of each shot.

## Tech stack
- **Vite** + **React** + **TypeScript**
- **MediaPipe Tasks Vision** (Pose Landmarker + Object Detector)
- **vite-plugin-pwa** (service worker + install prompt)
- No external CSS framework — hand-tuned soccer pitch aesthetic

## Develop
```
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview  # http://localhost:4173
```

## Deploy
```
./scripts/deploy.sh   # builds + pushes to gh-pages branch
```

Live at: https://keenannhtalbot-hue.github.io/footy-var/

## PWA install
On Android Chrome, install banner appears after 30s of engagement. On iOS Safari, use Share → Add to Home Screen (Apple blocks programmatic install).