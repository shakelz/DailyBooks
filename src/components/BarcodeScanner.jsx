import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// ── Beep sound generator (Web Audio API) ──
function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, ctx.currentTime); // High pitch
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.15);

        // Cleanup
        setTimeout(() => ctx.close(), 200);
    } catch (e) {
        // Audio not available, silently fail
    }
}

// ── Vibration ──
function triggerVibration() {
    try {
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]); // Short buzz pattern
        }
    } catch (e) {
        // Vibration not available
    }
}

export default function BarcodeScanner({ onScanSuccess, onScanError }) {
    const [isScanning, setIsScanning] = useState(false);
    const [lastScanned, setLastScanned] = useState('');
    const [scanFeedback, setScanFeedback] = useState('');
    const scannerRef = useRef(null);
    const html5QrCodeRef = useRef(null);
    const cooldownRef = useRef(false); // Prevent rapid duplicate scans

    const SCANNER_ID = 'barcode-camera-reader';

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopScanner();
        };
    }, []);

    const startScanner = useCallback(async () => {
        try {
            const html5QrCode = new Html5Qrcode(SCANNER_ID);
            html5QrCodeRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: 'environment' }, // Back camera
                {
                    fps: 10,
                    qrbox: { width: 280, height: 120 }, // Barcode shaped box
                    aspectRatio: 1.777,
                },
                (decodedText) => {
                    // ── On Successful Scan ──
                    if (cooldownRef.current) return;
                    cooldownRef.current = true;

                    // Feedback
                    playBeep();
                    triggerVibration();
                    setLastScanned(decodedText);
                    setScanFeedback('✅ Scanned!');

                    // Send barcode to parent
                    onScanSuccess?.(decodedText);

                    // Cooldown to prevent duplicate scans
                    setTimeout(() => {
                        cooldownRef.current = false;
                        setScanFeedback('');
                    }, 2000);
                },
                (errorMessage) => {
                    // QR scan errors are normal (happens every frame without a code), ignore
                }
            );

            setIsScanning(true);
        } catch (err) {
            console.error('Camera start error:', err);
            onScanError?.(err.message || 'Camera start nahi ho paya');
            setIsScanning(false);
        }
    }, [onScanSuccess, onScanError]);

    const stopScanner = useCallback(async () => {
        try {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                await html5QrCodeRef.current.stop();
                html5QrCodeRef.current.clear();
            }
        } catch (e) {
            // Already stopped
        }
        html5QrCodeRef.current = null;
        setIsScanning(false);
        setScanFeedback('');
    }, []);

    const toggleScanner = () => {
        if (isScanning) {
            stopScanner();
        } else {
            startScanner();
        }
    };

    return (
        <div className="relative">
            {/* Start/Stop Camera Button */}
            <button
                onClick={toggleScanner}
                id="camera-scan-toggle"
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer border
          ${isScanning
                        ? 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100 shadow-sm shadow-red-200/50'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-500 border-transparent text-white hover:from-blue-600 hover:to-cyan-600 shadow-md shadow-blue-500/25'
                    }`}
            >
                {isScanning ? (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                        </svg>
                        Stop Camera
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        📷 Start Camera
                    </>
                )}
            </button>

            {/* Camera View */}
            {isScanning && (
                <div className="mt-3 rounded-2xl overflow-hidden border-2 border-blue-300 shadow-lg shadow-blue-500/10 relative">
                    {/* Scanner viewport */}
                    <div id={SCANNER_ID} className="w-full" />

                    {/* Scan feedback overlay */}
                    {scanFeedback && (
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-bold shadow-lg animate-bounce z-10">
                            {scanFeedback}
                        </div>
                    )}

                    {/* Last scanned info */}
                    {lastScanned && (
                        <div className="bg-slate-900/90 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
                            <span className="text-xs text-slate-400">Last scanned:</span>
                            <span className="text-sm font-mono font-bold text-green-400">{lastScanned}</span>
                        </div>
                    )}

                    {/* Guide text */}
                    <div className="bg-blue-50 px-4 py-2 text-center">
                        <p className="text-[11px] text-blue-600 font-medium">
                            📱 Barcode ko camera ke saamne rakho — auto-detect karega
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
