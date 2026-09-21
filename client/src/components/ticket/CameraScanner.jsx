import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';

export default function CameraScanner({ active, onDecode, onStop }) {
  const video = useRef(null), callback = useRef(onDecode);
  const [error, setError] = useState(''), [ready, setReady] = useState(false);
  useEffect(() => { callback.current = onDecode; }, [onDecode]);
  useEffect(() => {
    if (!active) return;
    let disposed = false, stream, timer;
    const stop = () => { clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); if (video.current && video.current.srcObject === stream) video.current.srcObject = null; };
    setError(''); setReady(false);
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
        const { default: jsQR } = await import('jsqr');
        if (disposed) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (disposed) { stop(); return; }
        video.current.srcObject = stream; await video.current.play();
        if (disposed) { stop(); return; }
        setReady(true);
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
        function scan() {
          if (disposed) return;
          const view = video.current;
          if (view?.readyState >= 2 && view.videoWidth) {
            const scale = Math.min(1, 640 / view.videoWidth);
            canvas.width = Math.round(view.videoWidth * scale); canvas.height = Math.round(view.videoHeight * scale);
            context.drawImage(view, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' });
            if (qr) { stop(); callback.current(qr.data); return; }
          }
          timer = setTimeout(scan, 200);
        }
        scan();
      } catch (failure) {
        stop();
        if (!disposed) setError(failure.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser or use manual entry.' : failure.message === 'UNSUPPORTED' ? 'Camera scanning requires HTTPS or localhost and a supported browser. Use manual entry on this device.' : 'The camera could not start. Check that it is connected and not in use by another app, or use manual entry.');
      }
    }
    const hidden = () => { if (document.hidden) onStop(); };
    document.addEventListener('visibilitychange', hidden);
    start();
    return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', hidden); };
  }, [active, onStop]);
  if (!active) return null;
  return <section className="officer-camera" aria-label="QR camera scanner"><div className="officer-video"><video ref={video} muted playsInline aria-label="Live camera preview"/>{!ready && !error && <p role="status"><Camera aria-hidden="true"/>Starting camera… Allow camera access when prompted.</p>}</div>
    {error ? <p className="booking-notice error" role="alert">{error}</p> : <p>Hold the whole QR code inside the camera view. Scanning stops after one code is read.</p>}
    <button type="button" className="button button-outline" onClick={onStop}><CameraOff size={18}/>Stop camera</button><small>Video stays on this device. No images are uploaded.</small></section>;
}
