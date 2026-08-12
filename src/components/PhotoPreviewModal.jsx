import { useCallback, useState } from 'react';
import { savePhoto, isIOS } from '../utils/savePhoto';

export default function PhotoPreviewModal({ photo, meta, onClose }) {
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `retrooo-cam-${timestamp}.jpg`;

    const { method } = await savePhoto(photo, filename);

    if (method === 'cancelled') {
      setSaveState('idle');
      return;
    }
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1800);
  }, [photo]);

  const buttonLabel =
    saveState === 'saving' ? 'SAVING…' : saveState === 'saved' ? 'SAVED ✓' : isIOS() ? 'SAVE TO PHOTOS' : 'SAVE PHOTO';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-body-black/95 px-6 backdrop-blur-sm">
      {/* "print" frame around the photo, cream border like a physical print */}
      <div className="w-full max-w-sm rounded-sm bg-cream p-2 pb-6 shadow-2xl">
        <div className="aspect-[3/4] w-full overflow-hidden rounded-[1px] bg-black">
          <img src={photo} alt="Developed film photo" className="h-full w-full object-cover" />
        </div>
        <p className="mt-3 text-center font-mono text-[11px] tracking-widest text-body-black/60">
          {meta
            ? `${meta.filterLabel.toUpperCase()} · ISO ${meta.iso}${meta.flashFired ? ' · FLASH' : ''}`
            : 'DEVELOPED ON RETROOO CAM'}
        </p>
      </div>

      <div className="mt-8 flex w-full max-w-sm items-center gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-full border border-metal-light px-4 py-3 font-mono text-xs tracking-widest text-cream transition active:scale-95"
        >
          RETAKE
        </button>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="flex-[2] rounded-full bg-film-orange px-4 py-3 font-mono text-xs font-semibold tracking-widest text-body-black transition active:scale-95 disabled:opacity-70"
        >
          {buttonLabel}
        </button>
      </div>

      {isIOS() && (
        <p className="mt-3 max-w-sm text-center font-mono text-[10px] leading-relaxed tracking-wide text-cream/50">
          Tap Save, then choose "Save Image" in the share sheet.
        </p>
      )}
    </div>
  );
}
