import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { CameraIcon, FlashIcon } from './Icons.jsx';
import { cleanBarcode, isValidGtin } from '../lib/nutritionStore.js';

/**
 * Camera barcode scanner (EAN-13, EAN-8, UPC-A, UPC-E, Code-128).
 *
 * Engines, both free:
 *  1. The browser's native BarcodeDetector (Chrome / Edge / Android), hardware accelerated.
 *  2. @zxing/browser (open source, lazy-loaded) everywhere else: iOS Safari, Firefox, WebKitGTK.
 *
 * Live camera needs a secure context (HTTPS, localhost or the desktop app). Over plain-HTTP
 * LAN addresses browsers hide the camera API, so "Take Photo" (a file input that opens the
 * camera app) and manual entry are offered instead.
 *
 * `onDetected(code)` may return a promise; the modal shows "Looking up…" until it settles.
 */

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
const SCAN_INTERVAL_MS = 120;

async function createNativeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats });
  } catch {
    return null;
  }
}

let zxingPromise = null;
async function createZxingReader() {
  zxingPromise ||= Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await zxingPromise;
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: SCAN_INTERVAL_MS, delayBetweenScanSuccess: 400 });
}

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser settings, or type the barcode below.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device. Type the barcode number below.';
    case 'NotReadableError':
      return 'The camera is busy in another app. Close it and try again.';
    default:
      return 'Could not start the camera. Type the barcode number below.';
  }
}

export function BarcodeScannerModal({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const doneRef = useRef(false);
  const candidateRef = useRef({ code: '', at: 0 });
  // Parent callbacks change every render; keep them in a ref so the camera never restarts.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [phase, setPhase] = useState('starting'); // starting | scanning | blocked | lookup
  const [message, setMessage] = useState('');
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [manual, setManual] = useState('');
  const [detected, setDetected] = useState('');
  const [engine, setEngine] = useState('');
  const [attempt, setAttempt] = useState(0);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorch({ supported: false, on: false });
  }, []);

  const finish = useCallback(
    async (rawCode) => {
      const code = cleanBarcode(rawCode);
      if (doneRef.current || code.length < 6) return;
      doneRef.current = true;
      stopCamera();
      setDetected(code);
      setPhase('lookup');
      setMessage(`Looking up ${code}…`);
      try {
        navigator.vibrate?.(50);
      } catch {
        /* not supported */
      }
      try {
        await onDetectedRef.current?.(code);
      } catch {
        /* parent reports its own errors */
      }
    },
    [stopCamera]
  );

  /** Accept checksum-valid retail codes at once; anything else must read twice in a row. */
  const consider = useCallback(
    (raw) => {
      const code = String(raw || '').trim();
      if (!/^\d{6,14}$/.test(code)) return;
      if (isValidGtin(code)) return finish(code);
      const now = Date.now();
      const prev = candidateRef.current;
      if (prev.code === code && now - prev.at < 1500) return finish(code);
      candidateRef.current = { code, at: now };
    },
    [finish]
  );

  // Reset each time the modal opens.
  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    candidateRef.current = { code: '', at: 0 };
    setDetected('');
    setManual('');
  }, [open]);

  // Camera lifecycle.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let timer = 0;
    let zxControls = null;

    const start = async () => {
      setPhase('starting');
      setMessage('Starting camera…');
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setPhase('blocked');
        setMessage('Live scanning needs a secure connection (HTTPS, localhost or the desktop app). Take a photo of the barcode or type the number instead.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('blocked');
        setMessage('This browser has no camera access. Take a photo of the barcode or type the number instead.');
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        if (!cancelled) {
          setPhase('blocked');
          setMessage(cameraErrorMessage(err));
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      try {
        setTorch({ supported: Boolean(track?.getCapabilities?.().torch), on: false });
      } catch {
        /* getCapabilities unsupported */
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;

      const native = await createNativeDetector();
      if (cancelled) return;

      if (native) {
        setEngine('native');
        try {
          await video.play();
        } catch {
          /* autoplay quirks: the loop still runs once frames arrive */
        }
        setPhase('scanning');
        setMessage('Align product barcode inside frame…');
        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            if (video.readyState >= 2) {
              const codes = await native.detect(video);
              for (const c of codes) consider(c.rawValue);
            }
          } catch {
            /* frame not ready */
          }
          if (!cancelled && !doneRef.current) timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
        return;
      }

      // Open-source fallback.
      try {
        setEngine('zxing');
        const reader = await createZxingReader();
        if (cancelled) return;
        setPhase('scanning');
        setMessage('Align product barcode inside frame…');
        zxControls = await reader.decodeFromVideoElement(video, (result) => {
          if (result && !cancelled) consider(result.getText());
        });
        if (cancelled) zxControls.stop();
      } catch {
        if (!cancelled) {
          setPhase('blocked');
          setMessage('The barcode reader failed to load. Type the barcode number below.');
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        zxControls?.stop();
      } catch {
        /* already stopped */
      }
      stopCamera();
    };
  }, [open, attempt, consider, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorch((t) => ({ ...t, on: next }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const decodePhoto = async (file) => {
    if (!file) return;
    setMessage('Reading photo…');
    try {
      const native = await createNativeDetector();
      if (native && typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        const codes = await native.detect(bitmap);
        bitmap.close?.();
        const hit = codes.map((c) => c.rawValue).find((v) => /^\d{6,14}$/.test(v));
        if (hit) return finish(hit);
      }
      const reader = await createZxingReader();
      const url = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(url);
        return finish(result.getText());
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setMessage('No barcode found in that photo. Try again closer, with less glare, or type the number.');
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    const code = cleanBarcode(manual);
    if (code.length < 6) {
      setMessage('Enter the full number printed under the barcode (8–13 digits).');
      return;
    }
    finish(code);
  };

  const showVideo = phase === 'starting' || phase === 'scanning' || (phase === 'lookup' && engine);

  return (
    <Modal open={open} onClose={onClose} title="Scan Barcode" size="sheet modal-scanner">
      <div className={`scanner-view ${phase === 'blocked' ? 'is-blocked' : ''}`}>
        {/* Always mounted so the camera effect has an element to attach to. */}
        <video ref={videoRef} className="scanner-video" muted playsInline autoPlay hidden={!showVideo} aria-label="Camera preview" />
        {showVideo ? (
          <>
            <div className={`scanner-frame ${detected ? 'is-detected' : ''}`} aria-hidden>
              <span className="scanner-line" />
            </div>
            {torch.supported && phase === 'scanning' && (
              <button
                type="button"
                className={`icon-btn glass-btn scanner-torch ${torch.on ? 'is-on' : ''}`}
                onClick={toggleTorch}
                aria-pressed={torch.on}
                aria-label={torch.on ? 'Turn flashlight off' : 'Turn flashlight on'}
              >
                <FlashIcon width={20} height={20} />
              </button>
            )}
          </>
        ) : (
          <div className="scanner-placeholder">
            <CameraIcon width={34} height={34} />
          </div>
        )}
      </div>

      <p className={`scanner-status ${phase === 'blocked' ? 'is-warn' : ''} ${detected ? 'is-ok' : ''}`} role="status" aria-live="polite">
        {phase === 'lookup' && <span className="spinner" aria-hidden />}
        {message}
      </p>

      {phase !== 'lookup' && (
        <>
          <form className="scanner-manual" onSubmit={submitManual}>
            <input
              className="glass-input tabular"
              inputMode="numeric"
              enterKeyHint="search"
              placeholder="Barcode number, e.g. 5000159407236"
              value={manual}
              aria-label="Barcode number"
              onChange={(e) => /^\d{0,14}$/.test(e.target.value) && setManual(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={manual.length < 6}>
              Look up
            </button>
          </form>
          <div className="scanner-actions">
            <button type="button" className="btn btn-glass btn-subtle" onClick={() => fileRef.current?.click()}>
              <CameraIcon width={18} height={18} /> Take Photo
            </button>
            {phase === 'blocked' && (
              <button type="button" className="btn btn-ghost" onClick={() => setAttempt((a) => a + 1)}>
                Retry camera
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                decodePhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
