"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface PunchPhotoCaptureProps {
  staffName: string;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function PunchPhotoCapture({
  staffName,
  onCapture,
  onCancel,
  busy = false,
}: PunchPhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setReady(false);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch {
      setError("Camera access is required for punch photo verification. Allow camera permission and try again.");
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    onCapture(dataUrl);
  };

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 text-center">
        <p className="text-sm font-semibold text-slate-900">Identity verification</p>
        <p className="text-xs text-slate-500">
          Photo required for <span className="font-medium">{staffName}</span> — prevents buddy punching
        </p>
      </div>

      <div className="relative mx-auto aspect-[4/3] max-w-md overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white">
            Starting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4 text-center text-sm text-white">
            {error}
          </div>
        )}
        {ready && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-center text-xs text-white">
            Center your face in the frame
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={startCamera}>
            <RefreshCw className="h-4 w-4" />
            Retry camera
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={capture} disabled={!ready || busy}>
            <Camera className="h-4 w-4" />
            {busy ? "Verifying…" : "Capture & clock in"}
          </Button>
        </div>
      )}
    </div>
  );
}
