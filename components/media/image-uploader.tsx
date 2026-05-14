'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, ImagePlus } from 'lucide-react';

export type ImageUploaderProps = {
  entityType: 'product' | 'category';
  entityId?: string;
  currentImageUrl?: string | null;
  label?: string;
  onUploaded?: (result: { url: string; thumbnailUrl: string }) => void;
};

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function ImageUploader({
  entityType,
  entityId,
  currentImageUrl,
  label = 'Görsel Yükle',
  onUploaded,
}: ImageUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [preview, setPreview] = useState<string | null>(currentImageUrl ?? null);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      setErrorMsg('Desteklenmeyen format. JPG, PNG veya WEBP kullanın.');
      setUploadState('error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Dosya 5MB limitini aşıyor.');
      setUploadState('error');
      return;
    }

    // Local preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploadState('uploading');
    setProgress(10);
    setErrorMsg('');

    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    if (entityId) fd.append('entityId', entityId);

    try {
      // Simulate progress increments while waiting
      const progressInterval = window.setInterval(() => {
        setProgress((p) => Math.min(p + 15, 85));
      }, 300);

      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      window.clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { url: string; thumbnailUrl: string };
      setUploadState('success');
      setPreview(data.url);
      onUploaded?.(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Yükleme başarısız');
      setUploadState('error');
      setProgress(0);
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void uploadFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, entityId],
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = '';
  }

  function clearPreview() {
    setPreview(null);
    setUploadState('idle');
    setProgress(0);
    setErrorMsg('');
  }

  const isUploading = uploadState === 'uploading';

  return (
    <div className="space-y-2">
      {label && <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>}

      {preview ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
          <div className="relative h-48 w-full">
            <Image
              src={preview}
              alt="Önizleme"
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 400px"
              unoptimized={preview.startsWith('data:')}
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] text-slate-400">
              {uploadState === 'success' ? '✓ Yüklendi' : uploadState === 'uploading' ? 'Yükleniyor...' : 'Önizleme'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/15 disabled:opacity-50"
              >
                Değiştir
              </button>
              <button
                type="button"
                onClick={clearPreview}
                disabled={isUploading}
                className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
          {isUploading && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
              <div
                className="h-1 bg-sky-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 transition ${
            dragOver
              ? 'border-sky-400 bg-sky-500/10'
              : 'border-white/15 bg-white/4 hover:border-white/25 hover:bg-white/8'
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              <p className="text-xs text-slate-400">Yükleniyor... {progress}%</p>
              <div className="h-1 w-32 rounded-full bg-white/10">
                <div className="h-1 rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <ImagePlus className="h-7 w-7 text-slate-500" />
              <p className="text-sm font-semibold text-slate-300">Sürükle bırak veya tıkla</p>
              <p className="text-[11px] text-slate-500">JPG, PNG, WEBP — max 5MB</p>
            </>
          )}
        </div>
      )}

      {uploadState === 'error' && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-rose-400" />
          <span className="text-xs text-rose-200">{errorMsg}</span>
        </div>
      )}

      {uploadState === 'success' && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/12 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-emerald-200">Görsel başarıyla WorkflowAI'ya yüklendi ve optimize edildi.</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={onFileChange}
        className="hidden"
      />

      {/* Bulk upload hint */}
      <p className="text-[10px] text-slate-600">
        Görseller otomatik WEBP'e dönüştürülür, thumbnail oluşturulur ve CDN-ready olarak saklanır.
      </p>
    </div>
  );
}
